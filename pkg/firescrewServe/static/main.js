let baseVideoUrl = "/rec/";
let baseImageUrl = "/images/";
let imageGrid = document.getElementById('imageGrid');
let modal = document.getElementById('myModal');
let videoPlayer = document.getElementById('videoPlayer');
let span = document.getElementsByClassName("close")[0];

// New UI element references
let startTimeInput = document.getElementById('startTimeInput');
let endTimeInput = document.getElementById('endTimeInput');
let filterButton = document.getElementById('filterButton');
let promptInput = document.getElementById('promptInput');


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
  
// On page load, set default times and fetch data for today
window.onload = function () {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    // Format for datetime-local input: YYYY-MM-DDTHH:MM
    startTimeInput.value = todayStart.toISOString().slice(0, 16);
    endTimeInput.value = todayEnd.toISOString().slice(0, 16);
    
    promptInput.focus();
    buildPromptAndQuery(); // Load data for today by default
}

// Get eventInfo object
let eventInfo = document.getElementById('eventInfo');


/////// Randomize the color groups ///////
colorGroups.forEach(group => {
    for (let i = group.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [group[i], group[j]] = [group[j], group[i]];
    }
  });
  

let eventColorMap = {};
let lastGroupIndex = -1;
let lastTwoGroupIndices = [-1, -1];


function getEventColor(eventId) {
    if (!eventColorMap[eventId]) {
        let groupIndex;
        const maxTries = 10; // Set the maximum number of attempts to find a group index
        let tries = 0;

        do {
            groupIndex = Math.floor(Math.random() * colorGroups.length);
            tries++;

            if (tries > maxTries) {
                groupIndex = (lastTwoGroupIndices[0] + 1) % colorGroups.length; // Fallback strategy if a group index is not found
                break;
            }
        } while (lastTwoGroupIndices.includes(groupIndex)); // Ensure different group from the last two

        // Shift the last group indices, making room for the newly selected group index
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

function createImageElement(snapshot, item) {
    let imgDiv = document.createElement('div');
    imgDiv.classList.add("image-wrapper");

    let img = document.createElement('img');
    img.src = baseImageUrl + snapshot;

    // Add a background color based on the event
    let color = getEventColor(item.ID);
    img.style.boxShadow = `0 0 5px 1px ${color}`;  // NEW: Set the box-shadow color here.

    imgDiv.appendChild(img);

    // If there are objects, add the icon
    if (item.Objects && item.Objects.length > 0) {
        item.Objects.forEach(object => {
            let icon = document.createElement('i');
            icon.className = getObjectIcon(object.Class);
            imgDiv.appendChild(icon);
        });
    }

    return imgDiv;
}


function playVideo(videoFile, poster) {
    videoPlayer.poster = poster;  // Set the poster attribute
    videoPlayer.src = baseVideoUrl + videoFile;
    modal.style.display = "block";
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

// Main function to build the prompt and trigger the query
function buildPromptAndQuery() {
    let keywords = promptInput.value.trim();
    let startTime = startTimeInput.value;
    let endTime = endTimeInput.value;

    let finalPrompt = keywords;

    if (startTime && endTime) {
        // Format the date/time strings for the natural date parser
        const start = new Date(startTime);
        const end = new Date(endTime);
        const fromStr = `${start.toLocaleString('en-US')}`;
        const toStr = `${end.toLocaleString('en-US')}`;
        finalPrompt += ` from ${fromStr} to ${toStr}`;
    } else if (keywords === "") {
        // If everything is empty, don't query
        imageGrid.innerHTML = '<p style="color: #ccc; text-align: center;">Please select a date range or enter a keyword.</p>';
        return;
    }

    queryData(finalPrompt);
}

// Refactored queryData to accept a prompt
function queryData(promptValue) {
    if (!promptValue || promptValue.trim() === "") {
        return;
    }

    // Clear the image grid
    imageGrid.innerHTML = '';

    fetch('/api?prompt=' + encodeURIComponent(promptValue))
        .then(response => response.json())
        .then(data => {
            console.log('Received data:', data);

            if (data && data.data) {
                if (data.data.length === 0) {
                    imageGrid.innerHTML = '<p style="color: #ccc; text-align: center;">No events found for the selected criteria.</p>';
                    return;
                }
                data.data.forEach(item => {
                    item.Snapshots.forEach(snapshot => {
                        let imgDiv = document.createElement('div');
                        imgDiv.classList.add("image-wrapper");

                        let img = document.createElement('img');
                        // Snapshot path now includes the date directory, which is correct
                        img.src = baseImageUrl + snapshot;

                        let color = getEventColor(item.ID);
                        img.style.boxShadow = `0 0 6px 2px ${color}`;
                        imgDiv.appendChild(img);

                        let iconsDiv = document.createElement('div');
                        iconsDiv.classList.add('icons');

                        if (item.Objects && item.Objects.length > 0) {
                            let uniqueObjects = [...new Set(item.Objects.map(obj => obj.Class))];
                            uniqueObjects.forEach(objectClass => {
                                let icon = document.createElement('i');
                                icon.className = getObjectIcon(objectClass);
                                icon.classList.add("objectIcon");
                                iconsDiv.appendChild(icon);
                            });
                        }
                        imgDiv.appendChild(iconsDiv);

                        img.addEventListener('click', function () {
                            // VideoFile path now also includes the date directory
                            playVideo(item.VideoFile, baseImageUrl + snapshot);
                            eventInfo.innerHTML = '';
                            addInfoLabel('ID', item.ID, "infoLabelEventID");
                            let newDate = formatDate(item.MotionStart);
                            addInfoLabel('T', newDate, "infoLabelTime");
                            addInfoLabel('Cam', item.CameraName, "infoLabelCameraName");

                            let uniqueObjects = [...new Set(item.Objects.map(obj => obj.Class))];
                            uniqueObjects.forEach(object => {
                                addPlainLabel(object);
                            });
                        });
                        imageGrid.appendChild(imgDiv);
                    });
                });
            } else {
                console.error('Invalid data:', data);
                imageGrid.innerHTML = `<p style="color: #ff6b6b; text-align: center;">Error fetching data. Check console for details.</p><p style="color: #ccc; text-align: center;">${data.Error || ''}</p>`;
            }
        })
        .catch(error => {
            console.error('Error:', error);
            imageGrid.innerHTML = '<p style="color: #ff6b6b; text-align: center;">A network error occurred. Is the server running?</p>';
        });
}

// Event Listeners for the new UI
filterButton.addEventListener('click', buildPromptAndQuery);
promptInput.addEventListener('keydown', function(event) { if (event.key === "Enter") buildPromptAndQuery(); });
startTimeInput.addEventListener('keydown', function(event) { if (event.key === "Enter") buildPromptAndQuery(); });
endTimeInput.addEventListener('keydown', function(event) { if (event.key === "Enter") buildPromptAndQuery(); });

// Function to close the modal
function closeModal() {
    modal.style.display = "none";
    videoPlayer.pause();
    videoPlayer.currentTime = 0;
}

span.onclick = function () {
    closeModal();
}

window.onclick = function (event) {
    if (event.target == modal) {
        closeModal();
    }
}
