# 狀態機裡一個狀態的基底。
#
# 狀態只管「這段時間牠在做什麼」，不管下一個是什麼——挑下一個是
# state_machine.gd 的事。這樣新增一個動作只要再寫一個 recipe，
# 不用去改任何既有狀態的轉移規則。
class_name PetState
extends RefCounted

var pet: PetBody          ## 被驅動的身體
var cfg: Dictionary = {}  ## 這個狀態的參數（由 recipe 帶進來）
var _t := 0.0             ## 進入這個狀態之後過了幾秒

## 顯示在畫面角落的中文說明
var label: String = ""

func enter() -> void:
	_t = 0.0

func exit() -> void:
	pass

func update(delta: float) -> void:
	_t += delta

## 這個狀態打算維持幾秒。時間到狀態機會重新挑一個。
func duration() -> float:
	return float(cfg.get("secs", 5.0))

## 牠在這個狀態是不是醒著的。睡著的時候不接受戳。
func awake() -> bool:
	return true
