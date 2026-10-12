# 所有具體狀態。
#
# 動作分成兩類：
#   睡 / 發呆 / 走動 / 吃 —— 每種動物都有，寫成獨立的 class
#   專屬動作（舔毛、跑滾輪、沙浴…）—— 由 ActState 用一份「動作配方」演出來
#
# 會這樣分是因為專屬動作是資料來的：動物特性.txt 裡那二十幾個動作是
# 後端送過來的字串，不可能一個動作寫一個 class。配方把它們歸納成
# 幾種實際的動法（原地跳、來回蹭、轉圈、縮起來…），再由 id 對應過去。

const ST := preload("res://fsm/state.gd")


## 睡著：幾乎不動，只有呼吸起伏，旁邊冒 Z。
class SleepState extends ST:
	func enter() -> void:
		super.enter()
		label = "睡著了"
		pet.set_pose("sleep")
		pet.lie_down(true)
		pet.show_zzz(true)

	func exit() -> void:
		pet.show_zzz(false)
		pet.lie_down(false)

	func update(delta: float) -> void:
		super.update(delta)
		pet.breathe(_t, 0.9, 0.035)   # 慢而深

	func duration() -> float:
		return float(cfg.get("secs", 18.0))

	func awake() -> bool:
		return false


## 半夢半醒：趴著但偶爾動一下耳朵。
class DozeState extends ST:
	func enter() -> void:
		super.enter()
		label = "半夢半醒"
		pet.set_pose("sleep")
		pet.show_zzz(false)

	func update(delta: float) -> void:
		super.update(delta)
		pet.breathe(_t, 1.6, 0.02)
		# 每隔幾秒抖一下，看起來才不像靜止圖
		if fmod(_t, 3.0) < 0.18:
			pet.tilt(sin(_t * 26.0) * 2.5)
		else:
			pet.tilt(0.0)

	func duration() -> float:
		return float(cfg.get("secs", 9.0))


## 發呆：站著，呼吸，偶爾看看左右。
class IdleState extends ST:
	func enter() -> void:
		super.enter()
		label = "發呆中"
		pet.set_pose("idle")

	func update(delta: float) -> void:
		super.update(delta)
		pet.breathe(_t, 2.2, 0.022)
		if fmod(_t, 4.0) > 3.4:
			pet.face(-pet.facing)   # 轉頭看另一邊
			_t += 0.6               # 免得同一幀連續翻好幾次

	func duration() -> float:
		return float(cfg.get("secs", 6.0))


## 走動：在地板上來回，碰到邊就轉身。腳步用上下彈跳做出來。
class WalkState extends ST:
	var _speed := 42.0

	func enter() -> void:
		super.enter()
		label = cfg.get("label", "走來走去")
		pet.set_pose("walk")
		_speed = float(cfg.get("speed", 42.0))
		pet.face(1 if randf() < 0.5 else -1)

	func update(delta: float) -> void:
		super.update(delta)
		pet.walk(delta, _speed)
		# 兩拍一步：垂直彈跳 + 身體左右微傾，就有走路的感覺
		var step := absf(sin(_t * _speed * 0.14))
		pet.hop_offset(step * 3.0)
		pet.tilt(sin(_t * _speed * 0.14) * 3.0)

	func duration() -> float:
		return float(cfg.get("secs", 8.0))


## 吃東西：低頭、一口一口。主人有記錄飲食才會進這個狀態。
class EatState extends ST:
	func enter() -> void:
		super.enter()
		label = cfg.get("label", "吃東西")
		pet.set_pose("eat")
		pet.show_bowl(true)

	func exit() -> void:
		pet.show_bowl(false)

	func update(delta: float) -> void:
		super.update(delta)
		# 啃的節奏：快速的小幅點頭
		pet.hop_offset(absf(sin(_t * 7.0)) * 2.0)
		pet.tilt(sin(_t * 7.0) * 2.0)

	func duration() -> float:
		return float(cfg.get("secs", 7.0))


## 專屬動作。cfg.motion 決定實際怎麼動，cfg.label 是中文名稱。
class ActState extends ST:
	var _motion := "fidget"

	func enter() -> void:
		super.enter()
		label = cfg.get("label", "玩耍")
		_motion = cfg.get("motion", "fidget")
		pet.set_pose(cfg.get("pose", "play"))
		if _motion == "travel":
			pet.face(1 if randf() < 0.5 else -1)

	func update(delta: float) -> void:
		super.update(delta)
		match _motion:
			"bounce":                      # 原地連跳：兔子、天竺鼠、龍貓
				var phase := fmod(_t, 0.8) / 0.8
				pet.hop_offset(sin(phase * PI) * 26.0)
				pet.squash(1.0 - sin(phase * PI) * 0.12)
			"spin":                        # 轉圈：雪貂翻滾、鸚鵡攀爬
				pet.tilt(sin(_t * 3.0) * 26.0)
				pet.hop_offset(absf(sin(_t * 3.0)) * 8.0)
			"rub":                          # 來回蹭：舔毛、整理羽毛、沙浴
				pet.hop_offset(0.0)
				pet.tilt(sin(_t * 9.0) * 7.0)
				pet.squash(1.0 + sin(_t * 9.0) * 0.03)
			"curl":                         # 縮起來：刺蝟、躲小屋
				var k: float = clampf(_t / 1.2, 0.0, 1.0)
				pet.squash(1.0 - k * 0.22)
				pet.hop_offset(0.0)
			"bask":                         # 曬太陽：趴著不動，只有呼吸
				pet.lie_down(true)
				pet.breathe(_t, 1.4, 0.03)
			"travel":                       # 慢慢移動：陸龜慢走、刺蝟探索
				pet.walk(delta, float(cfg.get("speed", 14.0)))
				pet.hop_offset(absf(sin(_t * 2.0)) * 1.5)
			"wheel":                        # 跑滾輪：原地快速小跳
				pet.hop_offset(absf(sin(_t * 12.0)) * 7.0)
				pet.tilt(sin(_t * 12.0) * 4.0)
			_:                              # fidget：預設，小幅亂動
				pet.hop_offset(absf(sin(_t * 4.0)) * 5.0)
				pet.tilt(sin(_t * 2.0) * 5.0)

	func exit() -> void:
		pet.lie_down(false)
		pet.squash(1.0)

	func duration() -> float:
		return float(cfg.get("secs", 6.0))


## 被戳：不管在幹嘛都會停下來反應一下，結束後回到原本的作息。
class PokedState extends ST:
	func enter() -> void:
		super.enter()
		label = "被摸到了"
		pet.set_pose("happy")
		pet.show_heart(true)

	func exit() -> void:
		pet.show_heart(false)
		pet.squash(1.0)

	func update(delta: float) -> void:
		super.update(delta)
		var phase := fmod(_t, 0.55) / 0.55
		pet.hop_offset(sin(phase * PI) * 20.0)
		pet.squash(1.0 - sin(phase * PI) * 0.10)

	func duration() -> float:
		return 2.2
