# 入口。負責三件事：跟網頁要設定、把場景組起來、讓時間往前走。
#
# 遊戲本身不知道任何業務規則——牠不知道什麼叫蛋白質、不知道代幣怎麼算。
# 網頁把「現在幾點、這隻動物的作息曲線長怎樣、心情如何、穿了什麼」
# 丟進來，剩下的交給狀態機。這樣後端改規則不必重新匯出遊戲。
extends Node2D

const PetFSMScript := preload("res://fsm/state_machine.gd")

var _bg: Sprite2D
var _decor: Sprite2D
var _pet: PetBody
var _fsm: PetFSM
var _assets: AssetCache

var _rev := -1          ## 網頁那邊的設定版本，變了就重讀
var _cfg := {}
var _hour := 12.0       ## 遊戲內的時間，開場由網頁給，之後自己走
var _ready_to_run := false

## 遊戲內時間的流速。1.0 是真實時間；調大可以在幾分鐘內看完一整天，
## 用來檢查作息曲線有沒有照 動物特性.txt 走。
const TIME_SCALE := 1.0


func _ready() -> void:
	_assets = AssetCache.new()
	add_child(_assets)

	_bg = Sprite2D.new()
	_bg.centered = false
	add_child(_bg)

	_decor = Sprite2D.new()
	_decor.centered = true
	_decor.visible = false
	add_child(_decor)

	_pet = PetBody.new()
	add_child(_pet)

	_fsm = PetFSMScript.new()
	_fsm.pet = _pet
	_fsm.state_changed.connect(_on_state_changed)
	add_child(_fsm)
	_fsm.set_process(false)   # 設定還沒進來之前不要亂動

	get_viewport().size_changed.connect(_relayout)
	_poll_config()


func _process(delta: float) -> void:
	# 一小時 3600 秒
	_hour = fmod(_hour + delta * TIME_SCALE / 3600.0, 24.0)
	if _ready_to_run:
		_fsm.activity = _activity_at(_hour)
	_poll_config()


## 網頁改了設定就會把 rev 加一。用輪詢而不是 callback，是因為
## JavaScriptBridge 的 callback 要自己管生命週期，漏掉一個就整頁洩漏。
func _poll_config() -> void:
	if not OS.has_feature("web"):
		if _rev < 0:
			_apply(_demo_config())
		return
	var raw: Variant = JavaScriptBridge.eval("JSON.stringify(window.__petConfig || null)", true)
	if typeof(raw) != TYPE_STRING or raw == "null":
		return
	var cfg: Variant = JSON.parse_string(raw)
	if typeof(cfg) != TYPE_DICTIONARY:
		return
	if int(cfg.get("rev", 0)) == _rev:
		return
	_rev = int(cfg.get("rev", 0))
	_apply(cfg)


func _apply(cfg: Dictionary) -> void:
	_cfg = cfg
	_assets.setup(String(cfg.get("base", "")))
	_hour = float(cfg.get("hour", 12.0))

	_fsm.acts = cfg.get("acts", [])
	_fsm.mood = String(cfg.get("mood", "ok"))
	_fsm.ate_today = bool(cfg.get("ateToday", false))
	_fsm.activity = _activity_at(_hour)

	_load_all.call_deferred(cfg)


func _load_all(cfg: Dictionary) -> void:
	var view := get_viewport_rect().size

	var bg := await _assets.load_tex(String(cfg.get("scene", "")))
	if bg != null:
		_bg.texture = bg
	_relayout()

	# 逐格動畫的規格由後端送來（build-anim.sh 從素材的 animations.json 產的）
	var anim: Dictionary = cfg.get("anim", {})
	var sheet := await _assets.load_tex(String(anim.get("sheet", "")))
	if sheet == null:
		_say("載不到寵物的動畫")
		return
	_pet.setup(sheet, anim, float(cfg.get("size", 0.28)), view)

	var wear: Dictionary = cfg.get("wear", {})
	for slot in ["hat", "cloth", "shoe", "acc"]:
		_pet.wear(slot, await _assets.load_tex(String(wear.get(slot, ""))))

	var decor := await _assets.load_tex(String(cfg.get("decor", "")))
	_decor.texture = decor
	_decor.visible = decor != null
	_relayout()

	var bowl := await _assets.load_tex(String(cfg.get("bowl", "")))
	_pet.bowl.texture = bowl
	if bowl != null:
		var k: float = (view.y * 0.10) / maxf(1.0, float(bowl.get_height()))
		_pet.bowl.scale = Vector2(k, k)

	_ready_to_run = true
	_fsm.set_process(true)


## 畫布大小會跟著網頁的版面變，所以背景與地面要重算。
func _relayout() -> void:
	var view := get_viewport_rect().size
	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.__petDebug = %s;" % JSON.stringify(
			"view=%dx%d  bg=%s" % [view.x, view.y,
				str(_bg.texture.get_size()) if _bg.texture != null else "nil"]), true)
	if _bg.texture != null:
		var t := _bg.texture.get_size()
		# 用 cover：填滿畫布、不留黑邊，超出的部分往中間裁
		var k: float = maxf(view.x / t.x, view.y / t.y)
		_bg.scale = Vector2(k, k)
		_bg.position = (view - t * k) * 0.5
	if _decor.texture != null:
		# 擺飾跟寵物站在同一條地板線上，而且靠左——不這樣的話它會浮在半空中，
		# 或是剛好蓋在寵物身上。高度給場景的兩成，比寵物大一點點，像件家具。
		var k2: float = (view.y * 0.20) / maxf(1.0, float(_decor.texture.get_height()))
		_decor.scale = Vector2(k2, k2)
		var dh: float = _decor.texture.get_height() * k2
		_decor.position = Vector2(view.x * 0.15, view.y * PetBody.GROUND - dh * 0.5)
	if _ready_to_run:
		_pet.resize(float(_cfg.get("size", 0.28)), view)


func _activity_at(hour: float) -> float:
	var curve: Array = _cfg.get("curve", [])
	if curve.size() < 24:
		return 0.5
	var h: float = fposmod(hour, 24.0)
	var i := int(h)
	var t: float = h - i
	# 整點之間線性內插，活躍度才不會每小時跳一下
	return float(curve[i]) * (1.0 - t) + float(curve[(i + 1) % 24]) * t


## 畫面上不寫字——Godot 內建字型沒有中日韓字，中文會變成一排豆腐。
## 「現在在做什麼」交給網頁顯示，這裡只負責把字送出去。
func _say(text: String) -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.__petDoing = %s;" % JSON.stringify(text), true)


func _on_state_changed(label: String) -> void:
	_say(label)


func _unhandled_input(event: InputEvent) -> void:
	var tapped: bool = (event is InputEventScreenTouch and event.pressed) \
		or (event is InputEventMouseButton and event.pressed)
	if tapped and _ready_to_run:
		_fsm.poke()


## 在 Godot 編輯器裡直接按播放時用的假設定，不然沒有網頁就什麼都看不到。
func _demo_config() -> Dictionary:
	return {
		"rev": 0,
		"base": "http://127.0.0.1:3000",
		"scene": "/pets/scene-room.webp",
		"size": 0.30,
		"hour": float(Time.get_datetime_dict_from_system()["hour"]),
		"mood": "ok",
		"ateToday": true,
		"acts": [
			{"id": "groom", "label": "舔毛"},
			{"id": "scratch", "label": "抓抓板"},
			{"id": "sunbathe", "label": "曬太陽"},
		],
		"curve": [
			0.30, 0.20, 0.15, 0.15, 0.30, 0.70, 1.00, 0.90, 0.60, 0.40, 0.30, 0.25,
			0.20, 0.20, 0.25, 0.35, 0.50, 0.80, 1.00, 0.90, 0.60, 0.45, 0.40, 0.35,
		],
		"anim": {
			"w": 96, "h": 96, "sheet": "/pets/anim/cat.webp",
			"acts": {
				"idle": {"row": 0, "frames": 4, "fps": 4},
				"walk": {"row": 1, "frames": 4, "fps": 6},
				"eat": {"row": 2, "frames": 4, "fps": 6},
				"sleep": {"row": 3, "frames": 4, "fps": 4},
				"play": {"row": 4, "frames": 3, "fps": 6},
			},
		},
		"wear": {},
	}
