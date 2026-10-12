# 行為狀態機。
#
# 轉移不是寫死的圖，而是「時間到了就依權重重抽一個」。權重來自兩件事：
#
#   1. 作息曲線 —— 動物特性.txt 的生活習性，由後端算成 0~1 的活躍度
#   2. 主人的飲食 —— 心情與體態，吃不夠牠就懶，吃得好牠就愛玩
#
# 所以同一隻貓早上六點和中午十二點會做不一樣的事，而且是因為「貓是晨昏型
# 動物」這個事實，不是因為我在某個分支寫了 if hour == 6。
extends Node
class_name PetFSM

const S := preload("res://fsm/states.gd")
const ST := preload("res://fsm/state.gd")

## 專屬動作要怎麼動。key 是 動物特性.txt 那些動作的 id。
## 沒列到的動作會落到 fidget，不會壞掉，只是動得比較普通。
const RECIPES := {
	# 貓
	"groom":    {"motion": "rub",    "pose": "groom"},
	"scratch":  {"motion": "rub",    "pose": "play"},
	"sunbathe": {"motion": "bask",   "pose": "sleep", "secs": 10.0},
	# 狗
	"fetch":    {"motion": "travel", "pose": "play", "speed": 72.0},
	"wag":      {"motion": "fidget", "pose": "happy"},
	"doze":     {"motion": "bask",   "pose": "sleep", "secs": 9.0},
	# 兔
	"hop":      {"motion": "bounce", "pose": "play"},
	"wash":     {"motion": "rub",    "pose": "groom"},
	"nibble":   {"motion": "rub",    "pose": "eat"},
	# 倉鼠
	"wheel":    {"motion": "wheel",  "pose": "play", "secs": 8.0},
	"stash":    {"motion": "travel", "pose": "walk", "speed": 34.0},
	# 天竺鼠
	"graze":    {"motion": "rub",    "pose": "eat"},
	"hide":     {"motion": "curl",   "pose": "sleep"},
	"popcorn":  {"motion": "bounce", "pose": "happy"},
	# 刺蝟
	"explore":  {"motion": "travel", "pose": "walk", "speed": 22.0},
	"sniff":    {"motion": "fidget", "pose": "idle"},
	"curl":     {"motion": "curl",   "pose": "sleep"},
	# 雪貂
	"tunnel":   {"motion": "travel", "pose": "walk", "speed": 54.0},
	"roll":     {"motion": "spin",   "pose": "play"},
	"play":     {"motion": "bounce", "pose": "play"},
	# 鸚鵡
	"preen":    {"motion": "rub",    "pose": "groom"},
	"climb":    {"motion": "spin",   "pose": "play"},
	"squawk":   {"motion": "fidget", "pose": "happy"},
	# 陸龜
	"plod":     {"motion": "travel", "pose": "walk", "speed": 11.0, "secs": 9.0},
	"veggie":   {"motion": "rub",    "pose": "eat"},
	# 龍貓
	"dustbath": {"motion": "rub",    "pose": "groom"},
	"leap":     {"motion": "bounce", "pose": "play"},
	"gnaw":     {"motion": "rub",    "pose": "eat"},
}

var pet: PetBody
var current: ST = null
var _left := 0.0
var _resume_after_poke := true

## 由網頁餵進來的現況
var activity := 0.5          ## 0~1，作息曲線上的位置
var mood := "ok"             ## hungry / thin / ok / happy / round（跟 petState() 一致）
var acts: Array = []         ## [{id, label}]，這個物種的專屬動作
var ate_today := false       ## 主人今天有沒有記錄飲食

signal state_changed(label: String)


func _process(delta: float) -> void:
	if current == null:
		_pick()
		return
	current.update(delta)
	_left -= delta
	if _left <= 0.0:
		_pick()


## 切到指定狀態。state_machine 以外只有「被戳」會直接呼叫。
func go(state: ST) -> void:
	if current != null:
		current.exit()
	current = state
	current.pet = pet
	current.enter()
	_left = current.duration()
	state_changed.emit(current.label)


func poke() -> void:
	if current != null and not current.awake():
		# 睡著的時候戳牠只會翻個身，不會整隻跳起來
		pet.tilt(-6.0)
		return
	go(S.PokedState.new())


## 依權重抽下一個狀態。
func _pick() -> void:
	var w := _weights()
	var total := 0.0
	for k in w:
		total += w[k]
	var r := randf() * total
	for k in w:
		r -= w[k]
		if r <= 0.0:
			go(_make(k))
			return
	go(S.IdleState.new())


## 各狀態的權重。活躍度是主軸，心情只做加減。
func _weights() -> Dictionary:
	var a := activity
	# 餓著或沒力的時候整體往下壓一截，吃得好就往上
	match mood:
		"hungry", "thin":
			a *= 0.55
		"happy":
			a = minf(1.0, a * 1.15)
		"round":
			a *= 0.85   # 圓滾滾的時候懶一點
	var w := {}
	if a < 0.25:
		w = {"sleep": 70.0, "doze": 25.0, "idle": 5.0}
	elif a < 0.5:
		w = {"doze": 32.0, "idle": 34.0, "walk": 22.0, "act": 12.0}
	elif a < 0.75:
		w = {"idle": 18.0, "walk": 34.0, "act": 38.0, "doze": 10.0}
	else:
		w = {"idle": 8.0, "walk": 28.0, "act": 54.0, "doze": 2.0}
	# 主人今天有吃，寵物才會有東西吃——牠吃的跟主人一樣
	if ate_today and a >= 0.35:
		w["eat"] = 12.0
	# 同一個狀態連兩次看起來像卡住，把剛剛那個壓低
	if current != null:
		var last := _kind_of(current)
		if w.has(last):
			w[last] = w[last] * 0.35
	return w


func _kind_of(s: ST) -> String:
	if s is S.SleepState: return "sleep"
	if s is S.DozeState:  return "doze"
	if s is S.WalkState:  return "walk"
	if s is S.EatState:   return "eat"
	if s is S.ActState:   return "act"
	return "idle"


func _make(kind: String) -> ST:
	match kind:
		"sleep": return S.SleepState.new()
		"doze":  return S.DozeState.new()
		"walk":  return _with(S.WalkState.new(), {"speed": 38.0 + activity * 40.0})
		"eat":   return S.EatState.new()
		"act":   return _act()
		_:       return S.IdleState.new()


## 從這個物種的專屬動作裡挑一個，配上它的動法。
func _act() -> ST:
	if acts.is_empty():
		return S.IdleState.new()
	var a: Dictionary = acts[randi() % acts.size()]
	var id := String(a.get("id", ""))
	var cfg: Dictionary = (RECIPES.get(id, {"motion": "fidget"}) as Dictionary).duplicate()
	cfg["label"] = a.get("label", id)
	return _with(S.ActState.new(), cfg)


func _with(s: ST, cfg: Dictionary) -> ST:
	for k in cfg:
		s.cfg[k] = cfg[k]
	return s
