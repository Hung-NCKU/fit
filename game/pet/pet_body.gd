# 寵物的身體。狀態機只對這個類別下指令（跳、傾斜、壓扁、走），
# 真正怎麼畫是這裡的事。
#
# 動畫有兩層，疊在一起：
#
#   逐格動畫  pet/切片與動畫/ 那批素材，十隻動物各一張 4×5 的 sprite sheet，
#             五個動作一列一個：idle / walk / eat / sleep / play
#   程序動畫  上下彈、左右傾、壓扁拉長
#
# 專屬動作（舔毛、跑滾輪、沙浴…）有二十幾種，不可能每種都畫一列，
# 所以它們挑一個最接近的逐格動畫當底，再疊上自己的程序動作。
# 「跑滾輪」就是 play 的循環加上快速小跳，看起來就對了。
#
# 配件掛在身體底下，會自動跟著一起跳、一起傾斜，不必每個動作重擺一次。
class_name PetBody
extends Node2D

## 地板在畫面高度的哪裡。寵物與擺飾都站在這條線上，所以放在同一個常數，
## 不然一邊改了另一邊就浮起來。
const GROUND := 0.86

## 五列逐格動畫以外的姿勢，對應到最接近的那一列
const POSE_MAP := {
	"idle": "idle", "walk": "walk", "eat": "eat", "sleep": "sleep",
	"play": "play", "happy": "play", "groom": "idle", "stretch": "idle",
}

## 這一幀的狀態。狀態機寫這些欄位，_process 再合成成實際的 transform。
var _hop := 0.0        ## 離地高度（像素）
var _tilt := 0.0       ## 傾斜（度）
var _squash := 1.0     ## 1.0 是原狀，小於 1 是壓扁
var _breath := 0.0     ## 呼吸造成的垂直縮放增量
var _lying := false

var facing := 1        ## 1 面向右，-1 面向左

var body: AnimatedSprite2D
var bowl: Sprite2D
var zzz: Label
var heart: Label

var _slots := {}       ## hat/cloth/shoe/acc -> Sprite2D
var _base_scale := 1.0
var _frame := Vector2(96, 96)
## 動物在格子裡實際佔的高度比例（build-anim.sh 量出來的）
var _fill := 0.55
var _half_w := 40.0
var _bounds := Vector2(0, 480)
var _ground := 250.0


func _ready() -> void:
	# 身體要在狀態機之後才套用 transform，不然會慢一幀
	process_priority = 10

	body = AnimatedSprite2D.new()
	body.centered = true
	add_child(body)

	bowl = Sprite2D.new()
	bowl.centered = true
	bowl.visible = false
	add_child(bowl)

	zzz = _make_label("z z Z")
	heart = _make_label("♥")
	heart.add_theme_color_override("font_color", Color(1, 0.45, 0.55))

	for slot in ["cloth", "shoe", "acc", "hat"]:   # 順序就是疊的順序
		var s := Sprite2D.new()
		s.centered = true
		s.visible = false
		body.add_child(s)
		_slots[slot] = s


func _make_label(text: String) -> Label:
	var l := Label.new()
	l.text = text
	l.visible = false
	l.add_theme_font_size_override("font_size", 18)
	add_child(l)
	return l


## 設定這一隻。
##
## sheet 是整張 sprite sheet，meta 是 build-anim.sh 產生的規格
## （格子大小、每個動作在第幾列、幾幀、fps）。
## size_ratio 來自動物特性表——倉鼠 0.13、狗 0.34，所以同一個場景裡
## 的比例會接近真實體型，而不是每隻都一樣大。
func setup(sheet: Texture2D, meta: Dictionary, size_ratio: float, scene_size: Vector2) -> void:
	_frame = Vector2(float(meta.get("w", 96)), float(meta.get("h", 96)))
	_fill = clampf(float(meta.get("fill", 0.55)), 0.2, 1.0)
	body.sprite_frames = _build_frames(sheet, meta)

	_ground = scene_size.y * GROUND
	# size 說的是動物本身要多高，不是格子要多高，所以要把留白除掉
	_base_scale = (scene_size.y * size_ratio) / maxf(1.0, _frame.y * _fill)
	_half_w = _frame.x * _base_scale * 0.5
	_bounds = Vector2(_half_w + 6.0, scene_size.x - _half_w - 6.0)
	position = Vector2(scene_size.x * 0.5, _ground)
	set_pose("idle")
	_layout_slots()


## 畫布大小變了（手機轉向、版面變寬）只要重算比例，不必重建動畫。
func resize(size_ratio: float, scene_size: Vector2) -> void:
	_ground = scene_size.y * GROUND
	_base_scale = (scene_size.y * size_ratio) / maxf(1.0, _frame.y * _fill)
	_half_w = _frame.x * _base_scale * 0.5
	_bounds = Vector2(_half_w + 6.0, scene_size.x - _half_w - 6.0)
	position.x = clampf(position.x, _bounds.x, _bounds.y)
	position.y = _ground


## 把 sheet 切成 AtlasTexture 餵給 SpriteFrames。
## 一列是一個動作，meta 裡寫了那一列有幾幀——play 只有三幀，
## 第四格是空的，照 frames 取才不會閃一格空白。
func _build_frames(sheet: Texture2D, meta: Dictionary) -> SpriteFrames:
	var sf := SpriteFrames.new()
	sf.remove_animation("default")
	var acts: Dictionary = meta.get("acts", {})
	for name in acts:
		var a: Dictionary = acts[name]
		sf.add_animation(name)
		sf.set_animation_speed(name, float(a.get("fps", 5)))
		sf.set_animation_loop(name, true)
		var row := int(a.get("row", 0))
		for i in int(a.get("frames", 1)):
			var at := AtlasTexture.new()
			at.atlas = sheet
			at.region = Rect2(i * _frame.x, row * _frame.y, _frame.x, _frame.y)
			sf.add_frame(name, at)
	return sf


func set_pose(pose: String) -> void:
	if body.sprite_frames == null:
		return
	var anim: String = POSE_MAP.get(pose, "idle")
	if not body.sprite_frames.has_animation(anim):
		anim = "idle"
	if body.animation != anim or not body.is_playing():
		body.play(anim)
	_layout_slots()


## 穿上某個部位。tex 為 null 就是脫掉。
func wear(slot: String, tex: Texture2D) -> void:
	if not _slots.has(slot):
		return
	var s: Sprite2D = _slots[slot]
	s.texture = tex
	s.visible = tex != null
	_layout_slots()


## 配件相對身體的位置。逐格動畫每一幀姿勢都不同，不可能每幀對位，
## 所以是用格子的外框去估：戴在頭頂、穿在身上、套在腳下。
func _layout_slots() -> void:
	var anchors := {
		"hat":   [Vector2(0.0, -0.30), 0.40],
		"cloth": [Vector2(0.0,  0.08), 0.50],
		"shoe":  [Vector2(0.0,  0.30), 0.34],
		"acc":   [Vector2(0.0,  0.16), 0.30],
	}
	for slot in _slots:
		var s: Sprite2D = _slots[slot]
		if s.texture == null:
			continue
		var a: Array = anchors[slot]
		var off: Vector2 = a[0]
		var k: float = (_frame.x * float(a[1])) / maxf(1.0, float(s.texture.get_width()))
		s.scale = Vector2(k, k)
		s.position = Vector2(off.x * _frame.x, off.y * _frame.y)


func _process(_delta: float) -> void:
	# 合成：翻面 × 壓扁 × 呼吸
	var sx := _base_scale * facing * (2.0 - _squash)
	var sy := _base_scale * (_squash + _breath)
	if _lying:
		sy *= 0.9
		sx *= 1.04 * signf(sx)
	body.scale = Vector2(sx, sy)
	body.rotation_degrees = _tilt
	# 貼圖是中心對齊的，往上抬半格才會站在地板上。
	# 再補回格子底部那塊留白，不然牠會浮在空中。
	var h := _frame.y * absf(sy)
	var pad := h * (1.0 - _fill) * 0.5
	body.position = Vector2(0.0, -h * 0.5 + pad - _hop)

	zzz.position = Vector2(_half_w * 0.4, -h - 10.0 - _hop)
	heart.position = Vector2(-10.0, -h - 12.0 - _hop)
	bowl.position = Vector2(_half_w * 1.1 * facing, -6.0)


# ---- 給狀態機用的動作 ----

func breathe(t: float, speed: float, amp: float) -> void:
	_breath = sin(t * speed) * amp

func tilt(deg: float) -> void:
	_tilt = deg

func hop_offset(px: float) -> void:
	_hop = px

func squash(k: float) -> void:
	_squash = k

func lie_down(on: bool) -> void:
	_lying = on

func face(dir: int) -> void:
	facing = 1 if dir >= 0 else -1

## 往目前面對的方向走，碰到邊界就轉身。
func walk(delta: float, speed: float) -> void:
	position.x += speed * delta * facing
	if position.x < _bounds.x:
		position.x = _bounds.x
		facing = 1
	elif position.x > _bounds.y:
		position.x = _bounds.y
		facing = -1

func show_zzz(on: bool) -> void:
	zzz.visible = on

func show_heart(on: bool) -> void:
	heart.visible = on

func show_bowl(on: bool) -> void:
	bowl.visible = on and bowl.texture != null
