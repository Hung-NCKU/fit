# 執行時從同一個網域抓圖，轉成 Texture2D。
#
# 素材刻意不打包進 .pck：商城有一百多件商品，使用者換一頂帽子不該需要
# 重新匯出整個遊戲。網頁已經有 /pets/*.webp 了，遊戲直接抓同一份，
# 瀏覽器的 HTTP 快取還會順便幫忙（service worker 也會快取這個路徑）。
class_name AssetCache
extends Node

var _cache := {}
var _base := ""

func setup(base: String) -> void:
	_base = base.rstrip("/")


## 回傳 Texture2D，失敗回 null。同一個路徑只會抓一次。
func load_tex(path: String) -> Texture2D:
	if path.is_empty():
		return null
	if _cache.has(path):
		return _cache[path]

	var url := path if path.begins_with("http") else _base + path
	var req := HTTPRequest.new()
	add_child(req)
	if req.request(url) != OK:
		req.queue_free()
		return null

	var res: Array = await req.request_completed
	req.queue_free()
	if res[0] != HTTPRequest.RESULT_SUCCESS or int(res[1]) != 200:
		push_warning("抓不到素材：%s" % url)
		return null

	var img := Image.new()
	var body: PackedByteArray = res[3]
	# 素材都是 WebP，但留一條 PNG 的路，換素材時才不會整個黑掉
	if img.load_webp_from_buffer(body) != OK and img.load_png_from_buffer(body) != OK:
		push_warning("解不開這張圖：%s" % url)
		return null

	var tex := ImageTexture.create_from_image(img)
	_cache[path] = tex
	return tex
