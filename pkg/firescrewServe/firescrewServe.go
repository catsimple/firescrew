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
	color := "\x1b[0m"
	switch level {
	case "info":
		color = "\x1b[32m" // Green
	case "error":
		color = "\x1b[31m" // Red
	case "warning":
		color = "\x1b[33m" // Yellow
	case "debug":
		color = "\x1b[36m" // Cyan
	}
	fmt.Printf("%s%s [%s] %s\x1b[0m\n", color, time.Now().Format("15:04:05"), strings.ToUpper(level), msg)
}

// loadData 优化：使用 os.ReadDir 替代 Walk，使用 json.Decoder 替代 ReadAll
func loadData(baseFolder string, tStart, tEnd time.Time) ([]FileData, error) {
	var data []FileData

	// 截断到日期
	current := time.Date(tStart.Year(), tStart.Month(), tStart.Day(), 0, 0, 0, 0, tStart.Location())
	endDay := time.Date(tEnd.Year(), tEnd.Month(), tEnd.Day(), 0, 0, 0, 0, tEnd.Location())

	for !current.After(endDay) {
		dateStr := current.Format("2006-01-02")
		dailyFolder := filepath.Join(baseFolder, dateStr)

		// 优化：ReadDir 比 Walk 高效，因为我们只读这一层，不需要递归
		entries, err := os.ReadDir(dailyFolder)
		if err != nil {
			if !os.IsNotExist(err) {
				Log("warning", fmt.Sprintf("Cannot read dir %s: %v", dailyFolder, err))
			}
			current = current.AddDate(0, 0, 1)
			continue
		}

		for _, entry := range entries {
			// 只处理 .json 文件
			if entry.IsDir() || !strings.HasSuffix(strings.ToLower(entry.Name()), ".json") {
				continue
			}

			fullPath := filepath.Join(dailyFolder, entry.Name())
			file, err := os.Open(fullPath)
			if err != nil {
				continue
			}
			
			// 优化：使用 Decoder 流式解析，减少内存分配
			var fileData FileData
			if err := json.NewDecoder(file).Decode(&fileData); err != nil {
				file.Close()
				Log("error", fmt.Sprintf("JSON parse error %s: %v", entry.Name(), err))
				continue
			}
			file.Close()

			// 检查 MP4 是否存在 (保持原有逻辑，虽然有IO开销，但为了准确性需要保留)
			// 假设 VideoFile 是相对路径 "2025-01-01/clip.ts"
			fullVideoPath := filepath.Join(baseFolder, fileData.VideoFile)
			mp4FilePath := strings.TrimSuffix(fullVideoPath, filepath.Ext(fullVideoPath)) + ".mp4"
			
			if _, err := os.Stat(mp4FilePath); err == nil {
				// 更新为 .mp4 扩展名
				fileData.VideoFile = strings.TrimSuffix(fileData.VideoFile, filepath.Ext(fileData.VideoFile)) + ".mp4"
			}

			data = append(data, fileData)
		}

		current = current.AddDate(0, 0, 1)
	}

	return data, nil
}

// promptHandler 处理查询
func promptHandler(w http.ResponseWriter, r *http.Request) {
	type retObj struct {
		Success bool       `json:"success"`
		Data    []FileData `json:"data"`
	}

	query := r.URL.Query()
	startStr := query.Get("start")
	endStr := query.Get("end")
	keywordStr := query.Get("q")

	layout := "2006-01-02 15:04"
	var tStart, tEnd time.Time
	var err error

	now := time.Now()

	if startStr == "" {
		tStart = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	} else {
		tStart, err = time.ParseInLocation(layout, startStr, time.Local)
		if err != nil {
			tStart = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
		}
	}

	if endStr == "" {
		tEnd = time.Date(now.Year(), now.Month(), now.Day(), 23, 59, 59, 0, now.Location())
	} else {
		tEnd, err = time.ParseInLocation(layout, endStr, time.Local)
		if err != nil {
			tEnd = time.Date(now.Year(), now.Month(), now.Day(), 23, 59, 59, 0, now.Location())
		}
	}

	Log("info", fmt.Sprintf("Query: %s -> %s | Q: %s", tStart.Format(layout), tEnd.Format(layout), keywordStr))

	rawData, err := loadData(mediaPath, tStart, tEnd)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// 关键词处理
	var keywords []string
	if keywordStr != "" {
		rawWords := strings.Fields(strings.ToLower(keywordStr))
		for _, w := range rawWords {
			keywords = append(keywords, singular(w))
		}
	}

	var filteredData []FileData

	for _, item := range rawData {
		// 时间过滤
		motionTime, err := time.Parse(time.RFC3339, item.MotionStart)
		if err == nil {
			if motionTime.Before(tStart) || motionTime.After(tEnd) {
				continue
			}
		}

		// 关键词过滤
		if len(keywords) > 0 {
			matched := false
			// 1. 匹配相机名
			camName := strings.ToLower(item.CameraName)
			for _, k := range keywords {
				if strings.Contains(camName, k) {
					matched = true
					break
				}
			}

			// 2. 匹配物体
			if !matched {
				for _, obj := range item.Objects {
					objCls := strings.ToLower(obj.Class)
					objClsSingular := singular(objCls)
					for _, k := range keywords {
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
			if !matched {
				continue
			}
		}

		filteredData = append(filteredData, item)
	}

	// 排序：最新的在前
	sort.Slice(filteredData, func(i, j int) bool {
		return filteredData[i].MotionStart > filteredData[j].MotionStart
	})

	if filteredData == nil {
		filteredData = []FileData{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(retObj{Success: true, Data: filteredData})
}

// singular 增强版
func singular(word string) string {
	word = strings.ToLower(word)
	irregular := map[string]string{
		"people": "person", "men": "man", "women": "woman",
		"feet": "foot", "teeth": "tooth", "mice": "mouse",
		"children": "child",
	}
	if val, ok := irregular[word]; ok {
		return val
	}
	// 简单的规则
	if strings.HasSuffix(word, "es") && len(word) > 4 {
		// buses -> bus, boxes -> box (simplified)
		if strings.HasSuffix(word, "ses") || strings.HasSuffix(word, "xes") || strings.HasSuffix(word, "ches") {
			return word[:len(word)-2]
		}
	}
	if strings.HasSuffix(word, "s") && len(word) > 3 && !strings.HasSuffix(word, "ss") {
		return word[:len(word)-1]
	}
	return word
}

type httpRange struct {
	start, length int64
}

func (r *httpRange) contentRange(size int64) string {
	return fmt.Sprintf("bytes %d-%d/%d", r.start, r.start+r.length-1, size)
}

// rangeVideo
func rangeVideo(w http.ResponseWriter, req *http.Request) {
	relativePath := strings.TrimPrefix(req.URL.Path, "/rec/")
	requestedFilePath := filepath.Join(mediaPath, relativePath)

	// 尝试寻找 MP4
	mp4FilePath := strings.TrimSuffix(requestedFilePath, filepath.Ext(requestedFilePath)) + ".mp4"
	if _, err := os.Stat(mp4FilePath); err == nil {
		requestedFilePath = mp4FilePath
	}

	f, err := os.Open(requestedFilePath)
	if err != nil {
		http.Error(w, "Video not found", http.StatusNotFound)
		return
	}
	defer f.Close()

	fi, err := f.Stat()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	size := fi.Size()

	ra := &httpRange{start: 0, length: size}

	rangeHeader := req.Header.Get("Range")
	if rangeHeader != "" {
		ranges := strings.Split(rangeHeader, "=")[1]
		rangesSplit := strings.Split(ranges, "-")
		start, _ := strconv.ParseInt(rangesSplit[0], 10, 64)
		
		var end int64
		if len(rangesSplit) > 1 && rangesSplit[1] != "" {
			end, _ = strconv.ParseInt(rangesSplit[1], 10, 64)
		} else {
			end = size - 1
		}
		
		if start < 0 { start = 0 }
		if end >= size { end = size - 1 }
		
		ra.start = start
		ra.length = end - start + 1
	}

	contentType := "application/octet-stream"
	ext := strings.ToLower(filepath.Ext(requestedFilePath))
	if ext == ".mp4" {
		contentType = "video/mp4"
	} else if ext == ".ts" {
		contentType = "video/MP2T"
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

func serveImages(w http.ResponseWriter, r *http.Request) {
	requestFile := strings.TrimPrefix(r.URL.Path, "/images/")
	img := filepath.Join(mediaPath, requestFile)
	
	file, err := os.Open(img)
	if err != nil {
		http.Error(w, "Image not found", http.StatusNotFound)
		return
	}
	defer file.Close()

	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	io.Copy(w, file)
}

func Serve(path string, addr string) error {
	mediaPath = filepath.Clean(path)

	http.HandleFunc("/api", promptHandler)
	http.Handle("/static/", http.FileServer(http.FS(staticFiles)))
	http.HandleFunc("/images/", serveImages)
	http.HandleFunc("/rec/", rangeVideo)
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		f, err := staticFiles.Open("static/index.html")
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer f.Close()
		io.Copy(w, f)
	})

	Log("info", fmt.Sprintf("Server started. Media Root: %s | Address: %s", mediaPath, addr))
	return http.ListenAndServe(addr, nil)
}
