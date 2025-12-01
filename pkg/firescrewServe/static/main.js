// 全局配置
let baseVideoUrl = "/rec/";
let baseImageUrl = "/images/";

// DOM 元素
let imageGrid = document.getElementById('imageGrid');
let modal = document.getElementById('myModal');
let videoPlayer = document.getElementById('videoPlayer');
let span = document.getElementsByClassName("close")[0];
let eventInfo = document.getElementById('eventInfo');
let promptInput = document.getElementById('promptInput');
let startDateInput = document.getElementById('startDate');
let endDateInput = document.getElementById('endDate');

// 颜色组配置
const colorGroups = [
    [{ label: 'Red', color: 'hsla(0, 100%, 55%, 0.9)' }, { label: 'Orange', color: 'hsla(30, 100%, 55%, 0.9)' }],
    [{ label: 'Lime', color: 'hsla(90, 100%, 55%, 0.9)' }, { label: 'Cyan', color: 'hsla(180, 100%, 55%, 0.9)' }],
    [{ label: 'Purple', color: 'hsla(270, 100%, 55%, 0.9)' }, { label: 'Pink', color: 'hsla(330, 100%, 55%, 0.9)' }],
];
let eventColorMap = {};

// --- 初始化 ---
window.onload = function () {
    // 初始化时间选择器：今天 00:00 到 23:59
    const now = new Date();
    
    // 转换为本地 ISO 格式 (yyyy-MM-ddThh:mm)
    const toLocalISO = (date) => {
        const offset = date.getTimezoneOffset() * 60000;
        return new Date(date.getTime() - offset).toISOString().slice(0, 16);
    };

    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    startDateInput.value = toLocalISO(start);
    endDateInput.value = toLocalISO(end);

    // 聚焦输入框并自动查询一次
    promptInput.focus();
    queryData();
}

// --- 核心查询逻辑 ---

function queryData() {
    // 1. 获取参数
    // datetime-local 格式为 "2025-12-01T12:00"
    // 后端我们需要 "2025-12-01 12:00"
    let s = startDateInput.value.replace("T", " ");
    let e = endDateInput.value.replace("T", " ");
    let q = promptInput.value.trim();

    // 2. 构建 API URL
    let url = `/api?start=${encodeURIComponent(s)}&end=${encodeURIComponent(e)}&q=${encodeURIComponent(q)}`;
    console.log("Fetching:", url);

    // 显示加载中
    imageGrid.innerHTML = '<p style="color:#888; text-align:center; grid-column:1/-1;">Loading events...</p>';

    fetch(url)
        .then(response => response.json())
        .then(json => {
            imageGrid.innerHTML = '';
            
            if (!json.data || json.data.length === 0) {
                imageGrid.innerHTML = '<p style="color:#aaa; text-align:center; grid-column:1/-1; padding: 50px;">No events found for this period.</p>';
                return;
            }

            // 3. 渲染数据
            json.data.forEach(item => {
                // 安全检查：必须有快照
                if (!item.Snapshots || item.Snapshots.length === 0) return;

                // --- 核心优化：去重 ---
                // 每个 Event ID 只显示一张卡片，取中间的那张快照作为封面
                let midIndex = Math.floor(item.Snapshots.length / 2);
                let coverSnapshot = item.Snapshots[midIndex];

                // 创建容器
                let imgDiv = document.createElement('div');
                imgDiv.classList.add("image-wrapper");

                // 创建图片
                let img = document.createElement('img');
                img.src = baseImageUrl + coverSnapshot;
                img.loading = "lazy"; // 懒加载，提升性能
                
                // 边框颜色 (基于ID哈希)
                let color = getEventColor(item.ID);
                img.style.boxShadow = `0 0 8px 1px ${color}`;

                // --- 1. 图片 ---
                imgDiv.appendChild(img);

                // --- 2. 图标栏 ---
                let iconsDiv = document.createElement('div');
                iconsDiv.classList.add('icons');
                
                // 提取不重复的对象类型
                if (item.Objects && item.Objects.length > 0) {
                    let uniqueClasses = [...new Set(item.Objects.map(o => o.Class))];
                    uniqueClasses.forEach(cls => {
                        let icon = document.createElement('i');
                        icon.className = getObjectIcon(cls);
                        icon.classList.add("objectIcon");
                        iconsDiv.appendChild(icon);
                    });
                }
                imgDiv.appendChild(iconsDiv);

                // --- 3. 时间标签 (新增) ---
                let timeDiv = document.createElement('div');
                timeDiv.classList.add('time-label');
                // 格式化时间字符串
                timeDiv.innerText = formatDisplayTime(item.MotionStart);
                imgDiv.appendChild(timeDiv);

                // 点击播放
                img.addEventListener('click', function () {
                    playVideo(item.VideoFile, baseImageUrl + coverSnapshot);
                    showEventDetails(item);
                });

                imageGrid.appendChild(imgDiv);
            });
        })
        .catch(err => {
            console.error(err);
            imageGrid.innerHTML = '<p style="color:red; text-align:center; grid-column:1/-1;">Error connecting to server.</p>';
        });
}

// --- 详情弹窗逻辑 ---
function showEventDetails(item) {
    eventInfo.innerHTML = '';
    
    // ID
    addInfoLabel('ID', item.ID, "infoLabelEventID");
    // Time
    addInfoLabel('Time', item.MotionStart.replace("T", " ").split(".")[0], "infoLabelTime");
    // Camera
    addInfoLabel('Cam', item.CameraName, "infoLabelCameraName");
    
    // Objects Detail
    if (item.Objects) {
        let counts = {};
        item.Objects.forEach(o => { counts[o.Class] = (counts[o.Class] || 0) + 1; });
        
        let objContainer = document.createElement('div');
        objContainer.style.marginTop = "5px";
        for (let [cls, count] of Object.entries(counts)) {
            let badge = document.createElement('span');
            badge.innerText = `${cls} (${count})`;
            badge.className = "infoLabel";
            badge.style.border = "1px solid #666";
            badge.style.marginRight = "5px";
            objContainer.appendChild(badge);
        }
        eventInfo.appendChild(objContainer);
    }
}

// --- 辅助函数 ---

function formatDisplayTime(rfc3339Str) {
    // 后端返回格式: 2025-12-01T15:30:45.123456+09:00
    // 我们只需要 2025-12-01 15:30:45
    // 简单且稳健的方法是字符串切割
    let parts = rfc3339Str.split('T');
    if (parts.length < 2) return rfc3339Str;
    
    let datePart = parts[0];
    let timePart = parts[1].split('.')[0]; // 去掉毫秒和时区
    
    // 如果是今天，只显示时间，否则显示完整日期+时间 (可选优化)
    // 这里根据你的要求显示完整时间
    return `${datePart} ${timePart}`;
}

function getEventColor(eventId) {
    if (!eventColorMap[eventId]) {
        // 基于ID字符串生成简单的Hash颜色，保证同一个ID颜色固定
        let hash = 0;
        for (let i = 0; i < eventId.length; i++) {
            hash = eventId.charCodeAt(i) + ((hash << 5) - hash);
        }
        let flatColors = colorGroups.flat();
        let index = Math.abs(hash) % flatColors.length;
        eventColorMap[eventId] = flatColors[index].color;
    }
    return eventColorMap[eventId];
}

function getObjectIcon(c) {
    c = (c || "").toLowerCase();
    if(c.includes('car')) return 'fas fa-car';
    if(c.includes('person')) return 'fas fa-user';
    if(c.includes('truck')) return 'fas fa-truck';
    if(c.includes('bus')) return 'fas fa-bus';
    if(c.includes('cat')) return 'fas fa-cat';
    if(c.includes('dog')) return 'fas fa-dog';
    if(c.includes('bicycle') || c.includes('bike')) return 'fas fa-bicycle';
    if(c.includes('motor')) return 'fas fa-motorcycle';
    return 'fas fa-video';
}

function playVideo(url, poster) {
    videoPlayer.poster = poster;
    videoPlayer.src = baseVideoUrl + url;
    modal.style.display = "block";
    videoPlayer.play().catch(e => console.log("Autoplay blocked:", e));
}

function closeModal() {
    modal.style.display = "none";
    videoPlayer.pause();
    videoPlayer.currentTime = 0;
}

function addInfoLabel(name, val, cls) {
    let l = document.createElement('div');
    l.innerText = `${name}: ${val}`;
    l.className = "infoLabel " + (cls || "");
    eventInfo.appendChild(l);
}

// --- 事件监听 ---
span.onclick = closeModal;
window.onclick = e => { if(e.target == modal) closeModal(); };
promptInput.addEventListener('keydown', e => { if(e.key==="Enter") queryData(); });
