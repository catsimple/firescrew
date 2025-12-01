// --- Global Variables ---
let baseVideoUrl = "/rec/";
let baseImageUrl = "/images/";
let imageGrid = document.getElementById('imageGrid');
let modal = document.getElementById('myModal');
let videoPlayer = document.getElementById('videoPlayer');
let span = document.getElementsByClassName("close")[0];
let eventInfo = document.getElementById('eventInfo');

// UI Controls
let promptInput = document.getElementById('promptInput');
let quickDateSelect = document.getElementById('quickDate');
let datePicker = document.getElementById('datePicker');

// --- Color Configuration ---
const colorGroups = [
    // Warm colors
    [
      { label: 'Red', color: 'hsla(0, 100%, 55%, 0.9)' },
      { label: 'Light Red', color: 'hsla(15, 100%, 55%, 0.9)' },
      { label: 'Orange', color: 'hsla(30, 100%, 55%, 0.9)' },
      { label: 'Gold', color: 'hsla(45, 100%, 55%, 0.9)' },
      { label: 'Gold', color: 'hsla(54, 100%, 63%, 0.9)' },
      { label: 'Yellow', color: 'hsla(60, 100%, 55%, 0.9)' },
    ],
    // Cool colors
    [
      { label: 'Light Yellow', color: 'hsla(75, 100%, 55%, 0.9)' },
      { label: 'Lime', color: 'hsla(90, 100%, 55%, 0.9)' },
      { label: 'Light Green', color: 'hsla(150, 100%, 55%, 0.9)' },
      { label: 'Cyan', color: 'hsla(180, 100%, 55%, 0.9)' },
    ],
    // Purples and pinks
    [
      { label: 'Purple', color: 'hsla(270, 100%, 55%, 0.9)' },
      { label: 'Lavender', color: 'hsla(285, 100%, 55%, 0.9)' },
      { label: 'Magenta', color: 'hsla(300, 100%, 55%, 0.(8))' },
      { label: 'Pink', color: 'hsla(330, 100%, 55%, 0.9)' },
    ],
];

// Randomize color groups on load
colorGroups.forEach(group => {
    for (let i = group.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [group[i], group[j]] = [group[j], group[i]];
    }
});

let eventColorMap = {};
let lastGroupIndex = -1;
let lastTwoGroupIndices = [-1, -1];

// --- Initialization ---
window.onload = function () {
    // Set date picker to today
    const todayStr = new Date().toISOString().split('T')[0];
    if(datePicker) {
        datePicker.value = todayStr;
    }

    // Focus input
    if(promptInput) {
        promptInput.focus();
        // Clear default value if it says "today" to avoid duplication
        if(promptInput.value === "today") promptInput.value = "";
    }

    // Initial Query
    updateDateUI();
    queryData();
}

// --- Event Listeners ---

if(quickDateSelect) {
    quickDateSelect.addEventListener('change', function() {
        updateDateUI();
        queryData();
    });
}

if(datePicker) {
    datePicker.addEventListener('change', function() {
        queryData();
    });
}

if(promptInput) {
    promptInput.addEventListener('keydown', function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            queryData();
        }
    });
}

// Modal closing logic
span.onclick = function () { closeModal(); }
window.onclick = function (event) { if (event.target == modal) { closeModal(); } }


// --- Helper Functions ---

function updateDateUI() {
    if (quickDateSelect.value === 'custom') {
        datePicker.style.display = 'inline-block';
    } else {
        datePicker.style.display = 'none';
    }
}

function getEventColor(eventId) {
    if (!eventColorMap[eventId]) {
        let groupIndex;
        const maxTries = 10;
        let tries = 0;

        do {
            groupIndex = Math.floor(Math.random() * colorGroups.length);
            tries++;
            if (tries > maxTries) {
                groupIndex = (lastTwoGroupIndices[0] + 1) % colorGroups.length;
                break;
            }
        } while (lastTwoGroupIndices.includes(groupIndex));

        lastTwoGroupIndices[0] = lastTwoGroupIndices[1];
        lastTwoGroupIndices[1] = groupIndex;

        const colorGroup = colorGroups[groupIndex];
        const colorIndex = Math.floor(Math.random() * colorGroup.length);
        eventColorMap[eventId] = { color: colorGroup[colorIndex].color, index: colorIndex };
    }
    return eventColorMap[eventId].color;
}

function getObjectIcon(objectType) {
    switch (objectType) {
        case 'car': return 'fas fa-car';
        case 'truck': return 'fas fa-truck';
        case 'person': return 'fas fa-user';
        case 'bicycle': return 'fas fa-bicycle';
        case 'motorcycle': return 'fas fa-motorcycle';
        case 'bus': return 'fas fa-bus';
        case 'cat': return 'fas fa-cat';
        case 'dog': return 'fas fa-dog';
        case 'boat': return 'fas fa-ship';
        default: return 'fas fa-question';
    }
}

function formatDate(dateString) {
    let date = new Date(dateString);
    let day = String(date.getDate()).padStart(2, '0');
    let month = String(date.getMonth() + 1).padStart(2, '0');
    let year = String(date.getFullYear()).slice(2);
    let hours = String(date.getHours()).padStart(2, '0');
    let minutes = String(date.getMinutes()).padStart(2, '0');
    let seconds = String(date.getSeconds()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

function playVideo(videoFile, poster) {
    videoPlayer.poster = poster;
    videoPlayer.src = baseVideoUrl + videoFile;
    modal.style.display = "block";
    videoPlayer.play();
}

function closeModal() {
    modal.style.display = "none";
    videoPlayer.pause();
    videoPlayer.currentTime = 0;
}

function addInfoLabel(name, value, optClass) {
    let label = document.createElement('label');
    label.textContent = name + ': ' + value;
    label.classList.add("infoLabel");
    if (optClass) {
        label.classList.add(optClass);
    }
    eventInfo.appendChild(label);
}

function addPlainLabel(value, optClass) {
    let label = document.createElement('label');
    label.textContent = value;
    label.classList.add("infoLabel");
    if (optClass) {
        label.classList.add(optClass);
    }
    eventInfo.appendChild(label);
}

// --- Main Logic ---

function queryData() {
    // 1. Construct the Date Part
    const mode = quickDateSelect.value;
    let datePart = "";

    if (mode === 'today') {
        datePart = "today";
    } else if (mode === 'yesterday') {
        datePart = "yesterday";
    } else if (mode === 'custom') {
        const pickedDate = datePicker.value;
        // Construct a full day range for the backend to parse
        datePart = `from ${pickedDate} 00:00 to ${pickedDate} 23:59`;
    }

    // 2. Construct the Keyword Part
    // Strip out any manually typed date keywords to avoid conflict
    let keywordPart = promptInput.value.replace(/today|yesterday|from .* to .*/gi, "").trim();
    
    // 3. Combine
    let finalPrompt = `${datePart} ${keywordPart}`;
    
    console.log("Querying API with:", finalPrompt);

    // Clear grid
    imageGrid.innerHTML = '';

    fetch('/api?prompt=' + encodeURIComponent(finalPrompt))
        .then(response => response.json())
        .then(data => {
            console.log('Received data:', data);

            if (data && data.data) {
                // Check if no data found
                if (data.data.length === 0) {
                    imageGrid.innerHTML = '<p style="color:#aaa; text-align:center; width:100%;">No events found for this period.</p>';
                    return;
                }

                data.data.forEach(item => {
                    item.Snapshots.forEach(snapshot => {
                        let imgDiv = document.createElement('div');
                        imgDiv.classList.add("image-wrapper");

                        let img = document.createElement('img');
                        img.src = baseImageUrl + snapshot;

                        // Add a background color based on the event ID
                        let color = getEventColor(item.ID);
                        img.style.boxShadow = `0 0 6px 2px ${color}`;

                        imgDiv.appendChild(img);

                        // Icons
                        let iconsDiv = document.createElement('div');
                        iconsDiv.classList.add('icons');

                        if (item.Objects && item.Objects.length > 0) {
                            let uniqueObjects = [];
                            item.Objects.forEach(object => {
                                if (!uniqueObjects.includes(object.Class)) {
                                    uniqueObjects.push(object.Class);
                                }
                            });
                            uniqueObjects.forEach(objectClass => {
                                let icon = document.createElement('i');
                                icon.className = getObjectIcon(objectClass);
                                icon.classList.add("objectIcon");
                                iconsDiv.appendChild(icon);
                            });
                        }
                        imgDiv.appendChild(iconsDiv);

                        // Click event
                        img.addEventListener('click', function () {
                            playVideo(item.VideoFile, baseImageUrl + snapshot);
                            
                            // Populate Info Box
                            eventInfo.innerHTML = '';
                            addInfoLabel('ID', item.ID, "infoLabelEventID");
                            
                            let newDate = formatDate(item.MotionStart);
                            addInfoLabel('T', newDate, "infoLabelTime");
                            
                            addInfoLabel('Cam', item.CameraName, "infoLabelCameraName");

                            if (item.Objects && item.Objects.length > 0) {
                                let uniqueObjects = [];
                                item.Objects.forEach(object => {
                                    if (!uniqueObjects.includes(object.Class)) {
                                        uniqueObjects.push(object.Class);
                                    }
                                });
                                uniqueObjects.forEach(object => {
                                    addPlainLabel(object);
                                });
                            }
                        });

                        imageGrid.appendChild(imgDiv);
                    });
                });
            } else {
                console.error('Invalid data structure:', data);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            imageGrid.innerHTML = '<p style="color:red; text-align:center;">Error fetching data.</p>';
        });
}
