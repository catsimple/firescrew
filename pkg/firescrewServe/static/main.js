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
    const now = new Date();
    // 本地时间 ISO (yyyy-MM-ddThh:mm)
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

    promptInput.focus();
    queryData();
}

// --- 核心查询逻辑 ---
function queryData() {
    let s = startDateInput.value.replace("T", " ");
    let e = endDateInput.value.replace("T", " ");
    let q = promptInput.value.trim();

    let url = `/api?start=${encodeURIComponent(s)}&end=${encodeURIComponent(e)}&q=${encodeURIComponent(q)}`;
    
    imageGrid.innerHTML = '<p style="color:#888; text-align:center; grid-column:1/-1;">Loading events...</p>';

    fetch(url)
        .then(response => response.json())
        .then(json => {
            imageGrid.innerHTML = '';
            
            if (!json.data || json.data.length === 0) {
                imageGrid.innerHTML = '<p style="color:#aaa; text-align:center; grid-column:1/-1; padding: 50px;">No events found for this period.</p>';
                return;
            }

            json.data.forEach(item => {
                if (!item.Snapshots || item.Snapshots.length === 0) return;

                let midIndex = Math.floor(item.Snapshots.length / 2);
                let coverSnapshot = item.Snapshots[midIndex];

                let imgDiv = document.createElement('div');
                imgDiv.classList.add("image-wrapper");

                let img = document.createElement('img');
                img.src = baseImageUrl + coverSnapshot;
                img.loading = "lazy";
                
                let color = getEventColor(item.ID);
                img.style.boxShadow = `0 0 8px 1px ${color}`;

                imgDiv.appendChild(img);

                let iconsDiv = document.createElement('div');
                iconsDiv.classList.add('icons');
                
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

                let timeDiv = document.createElement('div');
                timeDiv.classList.add('time-label');
                timeDiv.innerText = formatDisplayTime(item.MotionStart);
                imgDiv.appendChild(timeDiv);

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

// --- 详情弹窗逻辑 (已优化) ---
function showEventDetails(item) {
    eventInfo.innerHTML = '';
    
    // 1. ID
    addInfoLabel('ID', item.ID, "infoLabelEventID");
    // 2. Time
    addInfoLabel('Time', item.MotionStart.replace("T", " ").split(".")[0], "infoLabelTime");
    // 3. Camera
    addInfoLabel('Cam', item.CameraName, "infoLabelCameraName");
    
    // 4. Objects Detail (同级添加，不再嵌套div)
    if (item.Objects && item.Objects.length > 0) {
        // 统计每个类别的数量 和 最大置信度
        let stats = {};
        item.Objects.forEach(o => {
            if (!stats[o.Class]) {
                stats[o.Class] = { count: 0, maxConf: 0.0 };
            }
            stats[o.Class].count++;
            if (o.Confidence > stats[o.Class].maxConf) {
                stats[o.Class].maxConf = o.Confidence;
            }
        });
        
        // 生成标签
        for (let [cls, data] of Object.entries(stats)) {
            // 计算百分比，保留1位小数
            let confPercent = (data.maxConf * 100).toFixed(1);
            let text = `${cls} (${data.count}) ${confPercent}%`;
            
            let badge = document.createElement('div');
            badge.innerText = text;
            // 添加特定的class以便样式控制
            badge.className = "infoLabel infoLabelObject"; 
            eventInfo.appendChild(badge);
        }
    }
}

// --- 辅助函数 ---

function formatDisplayTime(rfc3339Str) {
    let parts = rfc3339Str.split('T');
    if (parts.length < 2) return rfc3339Str;
    let datePart = parts[0];
    let timePart = parts[1].split('.')[0]; 
    return `${datePart} ${timePart}`;
}

function getEventColor(eventId) {
    if (!eventColorMap[eventId]) {
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
