package firescrewServe

import (
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

//go:embed static/*
var staticFiles embed.FS
var mediaPath string

type FileData struct {
	ID          string    `json:"ID"`
	MotionStart string    `json:"MotionStart"`
	MotionEnd   string    `json:"MotionEnd"`
	Objects     []Objects `json:"Objects"`
	Snapshots   []string  `json:"Snapshots"`
	VideoFile   string    `json:"VideoFile"`
	CameraName  string    `json:"CameraName"`
}

type Objects struct {
	BBox       BBox    `json:"BBox"`
	Center     Center  `json:"Center"`
	Area       int     `json:"Area"`
	LastMoved  string  `json:"LastMoved"`
	Class      string  `json:"Class"`
	Confidence float64 `json:"Confidence"`
}

type BBox struct {
	Min Coords `json:"Min"`
	Max Coords `json:"Max"`
}

type Coords struct {
	X int `json:"X"`
	Y int `json:"Y"`
}

type Center struct {
	X int `json:"X"`
	Y int `json:"Y"`
}

func Log(level, msg string) {
	switch level {
	case "info":
		fmt.Printf("\x1b[32m%s [INFO] %s\x1b[0m\n", time.Now().Format("15:04:05"), msg)
	case "error":
		fmt.Printf("\x1b[31m%s [ERROR] %s\x1b[0m\n", time.Now().Format("15:04:05"), msg)
	case "warning":
		fmt.Printf("\x1b[33m%s [WARNING] %s\x1b[0m\n", time.Now().Format("15:04:05"), msg)
	case "debug":
		fmt.Printf("\x1b[36m%s [DEBUG] %s\x1b[0m\n", time.Now().Format("15:04:05"), msg)
	default:
		fmt.Printf("%s [UNKNOWN] %s\n", time.Now().Format("15:04:05"), msg)
	}
}

// loadData 优化：根据时间范围计算需要扫描的日期文件夹
// baseFolder: /motion/
// tStart/tEnd: 查询的时间范围
func loadData(baseFolder string, tStart, tEnd time.Time) ([]FileData, error) {
	var data []FileData

	// 将时间截断到“天”，用于遍历文件夹
	current := time.Date(tStart.Year(), tStart.Month(), tStart.Day(), 0, 0, 0, 0, tStart.Location())
	endDay := time.Date(tEnd.Year(), tEnd.Month(), tEnd.Day(), 0, 0, 0, 0, tEnd.Location())

	// 循环遍历每一天
	for !current.After(endDay) {
		dateStr := current.Format("2006-01-02")
		dailyFolder := filepath.Join(baseFolder, dateStr)

		// 检查该日期的文件夹是否存在
		if _, err := os.Stat(dailyFolder); os.IsNotExist(err) {
			// 如果不存在，跳过这一天
			current = current.AddDate(0, 0, 1)
			continue
		}

		// 遍历该文件夹下的 JSON 文件
		err := filepath.Walk(dailyFolder, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return nil // 忽略错误
			}

			if !info.IsDir() && filepath.Ext(path) == ".json" {
				file, err := os.Open(path)
				if err != nil {
					return nil
				}
				defer file.Close()

				byteValue, err := io.ReadAll(file)
				if err != nil {
					return nil
				}

				var fileData FileData
				if err = json.Unmarshal(byteValue, &fileData); err != nil {
					return fmt.Errorf("error parsing JSON from file %s: %w", path, err)
				}

				// 检查是否存在 .mp4 版本
				// 注意：fileData.VideoFile 在 firescrew.go 中已经被保存为相对路径 "2025-01-01/clip.ts"
				// 我们需要拼接 baseFolder 来检查文件是否存在
				fullVideoPath := filepath.Join(baseFolder, fileData.VideoFile)
				
				// 构造 mp4 路径
				mp4FilePath := strings.TrimSuffix(fullVideoPath, filepath.Ext(fullVideoPath)) + ".mp4"
				
				if _, err := os.Stat(mp4FilePath); err == nil {
					// 如果 mp4 存在，更新 struct 中的路径后缀
					fileData.VideoFile = strings.TrimSuffix(fileData.VideoFile, filepath.Ext(fileData.VideoFile)) + ".mp4"
				}

				data = append(data, fileData)
			}
			return nil
		})

		if err != nil {
			Log("error", fmt.Sprintf("Error walking folder %s: %v", dailyFolder, err))
		}

		// 下一天
		current = current.AddDate(0, 0, 1)
	}

	return data, nil
}

// promptHandler 优化：不再使用 NLP，接收明确的参数
// URL: /api?start=2025-11-01 00:00&end=2025-11-02 23:59&q=car
func promptHandler(w http.ResponseWriter, r *http.Request) {
	type retObj struct {
		Success bool       `json:"success"`
		Data    []FileData `json:"data"`
	}

	query := r.URL.Query()
	startStr := query.Get("start")
	endStr := query.Get("end")
	keywordStr := query.Get("q")

	// 1. 解析时间
	// 前端传来的 datetime-local 替换 T 为空格后是 "2006-01-02 15:04"
	layout := "2006-01-02 15:04"
	var tStart, tEnd time.Time
	var err error

	// 解析开始时间
	if startStr == "" {
		now := time.Now()
		tStart = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	} else {
		tStart, err = time.ParseInLocation(layout, startStr, time.Local)
		if err != nil {
			// 尝试解析带秒的格式，或者 fallback
			Log("error", fmt.Sprintf("Time parse start error: %v", err))
			now := time.Now()
			tStart = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
		}
	}

	// 解析结束时间
	if endStr == "" {
		now := time.Now()
		tEnd = time.Date(now.Year(), now.Month(), now.Day(), 23, 59, 59, 0, now.Location())
	} else {
		tEnd, err = time.ParseInLocation(layout, endStr, time.Local)
		if err != nil {
			Log("error", fmt.Sprintf("Time parse end error: %v", err))
			now := time.Now()
			tEnd = time.Date(now.Year(), now.Month(), now.Day(), 23, 59, 59, 0, now.Location())
		}
	}

	Log("info", fmt.Sprintf("Query Range: %s -> %s | Keywords: %s", tStart.Format(layout), tEnd.Format(layout), keywordStr))

	// 2. 加载数据 (只扫描相关日期的文件夹)
	rawData, err := loadData(mediaPath, tStart, tEnd)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	Log("debug", fmt.Sprintf("Scanned %d potential events", len(rawData)))

	// 3. 处理关键词 (拆分并处理单复数)
	var keywords []string
	if keywordStr != "" {
		rawWords := strings.Fields(strings.ToLower(keywordStr))
		for _, w := range rawWords {
			keywords = append(keywords, singular(w))
		}
	}

	var filteredData []FileData

	// 4. 执行严格过滤
	for _, item := range rawData {
		// A. 时间过滤 (精确到秒)
		motionTime, err := time.Parse(time.RFC3339, item.MotionStart)
		if err != nil {
			continue
		}

		// 检查时间是否在范围内
		if motionTime.Before(tStart) || motionTime.After(tEnd) {
			continue
		}

		// B. 关键词过滤
		// 如果有关键词，必须匹配其中至少一个
		if len(keywords) > 0 {
			matched := false
			
			// 1. 检查相机名称
			camName := strings.ToLower(item.CameraName)
			for _, k := range keywords {
				if strings.Contains(camName, k) {
					matched = true
					break
				}
			}

			// 2. 检查识别到的物体
			if !matched {
				for _, obj := range item.Objects {
					objCls := strings.ToLower(obj.Class)
					// 处理物体名称的单复数
					objClsSingular := singular(objCls)
					
					for _, k := range keywords {
						// 只要包含关键词即可 (例如输入 car，匹配 car, truck)
						if strings.Contains(objClsSingular, k) || strings.Contains(objCls, k) {
							matched = true
							break
						}
					}
					if matched {
						break
					}
				}
			}

			// 如果所有关键词都没匹配上，跳过此条目
			if !matched {
				continue
			}
		}

		filteredData = append(filteredData, item)
	}

	// 5. 排序：最新的在前
	sort.Slice(filteredData, func(i, j int) bool {
		// 简单的字符串比较 RFC3339 日期通常是可行的，
		// 但为了保险，还是解析一下，或者直接比字符串(如果格式严格一致)
		return filteredData[i].MotionStart > filteredData[j].MotionStart
	})

	Log("info", fmt.Sprintf("Returning %d filtered events", len(filteredData)))

	// 必须初始化为空切片，否则 JSON 会返回 null
	if filteredData == nil {
		filteredData = []FileData{}
	}

	ret := retObj{
		Success: true,
		Data:    filteredData,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ret)
}

// singular 简单的单数化处理
func singular(word string) string {
	irregularPlurals := map[string]string{
		"people": "person",
		"mice":   "mouse",
		"feet":   "foot",
		"teeth":  "tooth",
		"men":    "man",
		"women":  "woman",
	}

	lowerWord := strings.ToLower(word)

	if val, ok := irregularPlurals[lowerWord]; ok {
		return val
	}

	// 简单的去 's' 规则
	if strings.HasSuffix(lowerWord, "s") && len(lowerWord) > 3 {
		return lowerWord[:len(lowerWord)-1]
	}

	return lowerWord
}

type httpRange struct {
	start, length int64
}

func (r *httpRange) contentRange(size int64) string {
	return fmt.Sprintf("bytes %d-%d/%d", r.start, r.start+r.length-1, size)
}

// rangeVideo 支持视频流传输
func rangeVideo(w http.ResponseWriter, req *http.Request) {
	// 获取请求路径
	// req.URL.Path 例如: /rec/2025-01-01/clip_123.ts
	// strings.TrimPrefix 后: 2025-01-01/clip_123.ts
	// filepath.Join 后: /motion/2025-01-01/clip_123.ts
	relativePath := strings.TrimPrefix(req.URL.Path, "/rec/")
	requestedFilePath := filepath.Join(mediaPath, relativePath)

	// 检查 mp4 是否存在
	mp4FilePath := strings.TrimSuffix(requestedFilePath, filepath.Ext(requestedFilePath)) + ".mp4"
	if _, err := os.Stat(mp4FilePath); err == nil {
		requestedFilePath = mp4FilePath
	}

	// Determine Content-Type
	var contentType string
	switch filepath.Ext(requestedFilePath) {
	case ".ts":
		contentType = "video/MP2T"
	case ".mp4":
		contentType = "video/mp4"
	default:
		contentType = "application/octet-stream"
	}

	f, err := os.Open(requestedFilePath)
	if err != nil {
		Log("error", fmt.Sprintf("Unable to open video file: %s", err))
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	defer f.Close()

	fi, err := f.Stat()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	size := fi.Size()

	ra := &httpRange{
		start:  0,
		length: size,
	}

	rangeHeader := req.Header.Get("Range")
	if rangeHeader != "" {
		ranges := strings.Split(rangeHeader, "=")[1]
		rangesSplit := strings.Split(ranges, "-")
		start, err := strconv.ParseInt(rangesSplit[0], 10, 64)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		var end int64
		if rangesSplit[1] == "" {
			end = size - 1
		} else {
			end, err = strconv.ParseInt(rangesSplit[1], 10, 64)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
		}
		ra.start = start
		ra.length = end - start + 1
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Content-Length", strconv.FormatInt(ra.length, 10))
	w.Header().Set("Content-Range", ra.contentRange(size))
	w.WriteHeader(http.StatusPartialContent)

	if req.Method != http.MethodHead {
		f.Seek(ra.start, 0)
		io.CopyN(w, f, ra.length)
	}
}

// serveImages 服务图片文件
func serveImages(w http.ResponseWriter, r *http.Request) {
	// req.URL.Path: /images/2025-01-01/snap_123.jpg
	// Strip prefix: 2025-01-01/snap_123.jpg
	requestFile := strings.TrimPrefix(r.URL.Path, "/images/")
	
	// Join with mediaPath: /motion/2025-01-01/snap_123.jpg
	img := filepath.Join(mediaPath, requestFile)
	
	file, err := os.Open(img)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	defer file.Close()

	w.Header().Set("Content-Type", "image/jpeg")
	// 设置缓存控制，因为图片写入后一般不会变
	w.Header().Set("Cache-Control", "public, max-age=86400")
	
	if _, err = io.Copy(w, file); err != nil {
		// Connection reset by peer 等错误不需要 log error
		return
	}
}

func Serve(path string, addr string) error {
	// 清理路径
	mediaPath = filepath.Clean(path)

	// API 路由
	http.HandleFunc("/api", promptHandler)

	// 静态资源路由
	http.Handle("/static/", http.FileServer(http.FS(staticFiles)))

	// 图片服务
	http.HandleFunc("/images/", serveImages)

	// 视频服务
	http.HandleFunc("/rec/", func(w http.ResponseWriter, r *http.Request) {
		rangeVideo(w, r)
	})

	// 首页路由
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// 总是返回 index.html
		f, err := staticFiles.Open("static/index.html")
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer f.Close()
		_, err = io.Copy(w, f)
	})

	Log("info", fmt.Sprintf("Server started. Media Root: %s | Address: %s", mediaPath, addr))

	err := http.ListenAndServe(addr, nil)
	if err != nil {
		return err
	}

	return nil
}
