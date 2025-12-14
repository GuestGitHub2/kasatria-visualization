let loginEffect;

/* CONFIGURATION 
   Using the keys you provided in the prompt.
*/
// Keys are now loaded from config.js

const DISCOVERY_DOC_SHEETS = 'https://sheets.googleapis.com/$discovery/rest?version=v4';
// ADDED: Discovery doc for user info
const DISCOVERY_DOC_PEOPLE = 'https://www.googleapis.com/discovery/v1/apis/oauth2/v3/rest';
// UPDATED: Add 'profile' scope to get user info
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets.readonly profile';

let tokenClient;
let gapiInited = false;
let gisInited = false;

// 1. AUTHENTICATION & GOOGLE SETUP
function gapiLoaded() {
    gapi.load('client', intializeGapiClient);
}

async function intializeGapiClient() {
    await gapi.client.init({
        apiKey: CONFIG.API_KEY,
        // Load both Sheets and User Info discovery docs
        discoveryDocs: [DISCOVERY_DOC_SHEETS, DISCOVERY_DOC_PEOPLE],
    });
    gapiInited = true;
    maybeEnableButtons();
}



function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.CLIENT_ID,
        scope: SCOPES,
        callback: '', // defined later
    });
    gisInited = true;
    maybeEnableButtons();
}

function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        document.getElementById('authorize_button').style.display = 'inline-block';
    }
}

function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            throw (resp);
        }
        // ESSENTIAL: Pass the access token to gapi to enable API calls
        gapi.client.setToken(resp);

        // Destroy the background effect to save performance
        if (loginEffect) {
            loginEffect.destroy();
            loginEffect = null;
        }

        // 1. Hide Login Overlay
        document.getElementById('login-overlay').style.display = 'none';

        // 2. Fetch and show user info in header
        await fetchAndShowUserProfile();

        // 3. Load Sheet Data
        await loadSheetData();
    };

    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        tokenClient.requestAccessToken({ prompt: '' });
    }
}

// --- NEW FUNCTION: Fetch User Profile ---
async function fetchAndShowUserProfile() {
    try {
        // 1. Get the access token we just received
        const token = gapi.client.getToken();
        if (!token) {
            console.error("No access token found.");
            return;
        }

        // 2. Use standard fetch (More reliable than gapi.client.request)
        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: {
                'Authorization': `Bearer ${token.access_token}`
            }
        });

        if (!response.ok) {
            throw new Error(`Profile fetch failed: ${response.statusText}`);
        }

        const userData = await response.json();

        // 3. Update Header HTML
        document.getElementById('user-name').textContent = userData.name;
        document.getElementById('user-photo').src = userData.picture;

        // 4. Show the Header
        document.getElementById('app-header').style.display = 'flex';

    } catch (err) {
        console.error("Error fetching user profile:", err);
        // Even if profile fails, show the header so the logo is visible
        document.getElementById('app-header').style.display = 'flex';
        document.getElementById('user-name').textContent = "User";
    }
}

// 2. FETCH DATA FROM SHEETS
async function loadSheetData() {
    let response;
    try {
        response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: CONFIG.RANGE,
        });
    } catch (err) {
        console.error(err);
        alert("Error loading Sheet data: " + JSON.stringify(err.result.error.message));
        return;
    }

    const range = response.result;
    if (!range || !range.values || range.values.length === 0) {
        alert("No data found. Check your Sheet Name ('Data_Template') and Range ('A2:F').");
        return;
    }

    // Pass data to ThreeJS init
    initThreeJS(range.values);
}

// 3. THREE.JS VISUALIZATION
const table = []; // Will hold the raw data objects
const objects = []; // Will hold the 3D objects
const targets = { table: [], sphere: [], helix: [], grid: [], pyramid: [] };

let camera, scene, renderer, controls;

function initThreeJS(data) {

    camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 1, 10000);
    camera.position.z = 3000;

    scene = new THREE.Scene();

    // --- PROCESS DATA ---
    // CSV Columns: Name(0), Photo(1), Age(2), Country(3), Interest(4), Net Worth(5)

    for (let i = 0; i < data.length; i++) {
        const row = data[i];

        // Create DOM Element
        const element = document.createElement('div');
        element.className = 'element';

        // NET WORTH COLOR LOGIC
        // Remove '$', ',' and convert to float
        let moneyStr = row[5] || "$0";
        let moneyVal = parseFloat(moneyStr.replace(/[$,]/g, ''));

        let borderColor = '#3A9F48'; // Green > 200k

        if (moneyVal > 200000) {
            borderColor = '#3A9F48'; // Green
        } else if (moneyVal > 100000) {
            borderColor = '#FDCA35'; // Yellow/Orange
        } else {
            borderColor = '#EF3022'; // Red
        }

        element.style.borderColor = borderColor;
        element.style.boxShadow = `0px 0px 12px ${borderColor}`;

        // CONTENT (Image B structure)
        // CSV: Name(0), Photo(1), Age(2), Country(3), Interest(4), Net Worth(5)
        const name = row[0];
        const photoUrl = row[1];
        const age = row[2];
        const country = row[3];
        const interest = row[4];

        element.innerHTML = `
            <div class="top-row">
                <span class="country">${country}</span>
                <span class="age">${age}</span>
            </div>
            <div class="photo" style="background-image: url('${photoUrl}')"></div>
            <div class="info">
                <div class="name">${name}</div>
                <div class="interest">${interest}</div>
            </div>
        `;

        // Create CSS3D Object
        const object = new THREE.CSS3DObject(element);
        object.position.x = Math.random() * 4000 - 2000;
        object.position.y = Math.random() * 4000 - 2000;
        object.position.z = Math.random() * 4000 - 2000;
        scene.add(object);
        objects.push(object);
    }

    // --- DEFINE LAYOUTS ---

    // 1. TABLE (20x10)
    // 20 columns wide.
    for (let i = 0; i < objects.length; i++) {
        const object = new THREE.Object3D();

        // column index (0 to 19)
        const col = i % 20;
        // row index
        const row = Math.floor(i / 20);

        object.position.x = (col * 140) - 1330; // Center offset logic
        object.position.y = -(row * 180) + 990;
        object.position.z = 0;

        targets.table.push(object);
    }

    // 2. SPHERE (Standard Math)
    const vector = new THREE.Vector3();
    for (let i = 0; i < objects.length; i++) {
        const phi = Math.acos(-1 + (2 * i) / objects.length);
        const theta = Math.sqrt(objects.length * Math.PI) * phi;
        const object = new THREE.Object3D();
        object.position.setFromSphericalCoords(800, phi, theta);
        vector.copy(object.position).multiplyScalar(2);
        object.lookAt(vector);
        targets.sphere.push(object);
    }

    // 3. DOUBLE HELIX (DNA Structure)
    for (let i = 0; i < objects.length; i++) {
        // DNA Logic: Two strands (evens and odds) paired at the same level (Base Pairs).

        // Row determines vertical position. Every 2 items share a row.
        const row = Math.floor(i / 2);
        const strand = i % 2; // 0 for Strand A, 1 for Strand B

        // Spacing parameters
        const spacing = 35; // Increased visual gap (was 8) to separate tiers
        const thetaStep = 0.25; // Tighter twist
        const radius = 750; // Compliment the strands by bringing them slightly closer (was 900)

        // Theta: Rotates based on row. Strand B is offset by PI (180 deg).
        const theta = row * thetaStep + (strand * Math.PI);

        // Y: Linear descent
        const y = -(row * spacing) + 800;

        const object = new THREE.Object3D();
        object.position.setFromCylindricalCoords(radius, theta, y);

        // Look at vector (face outward/inward)
        vector.x = object.position.x * 2;
        vector.y = object.position.y;
        vector.z = object.position.z * 2;
        object.lookAt(vector);

        targets.helix.push(object);
    }

    // 4. GRID (5x4x10)
    // x varies 0-4, y varies 0-3, z varies 0-9
    for (let i = 0; i < objects.length; i++) {
        const object = new THREE.Object3D();

        object.position.x = ((i % 5) * 400) - 800;
        object.position.y = (-(Math.floor(i / 5) % 4) * 400) + 800;
        object.position.z = (Math.floor(i / 20) * 1000) - 2000;

        targets.grid.push(object);
    }

    // 5. PYRAMID (Tetrahedron)
    // A tetrahedron has 4 vertices. We will create 4 triangular faces.
    // We calculate 4 corners of a regular tetrahedron.
    const r = 1000; // Radius/Size of the pyramid
    const corners = [
        new THREE.Vector3(r, r, r),
        new THREE.Vector3(-r, -r, r),
        new THREE.Vector3(-r, r, -r),
        new THREE.Vector3(r, -r, -r)
    ];

    // We define the 4 triangular faces by connecting corners
    // Face 1: 0-1-2, Face 2: 0-2-3, Face 3: 0-3-1, Face 4: 1-3-2
    const faces = [
        [corners[0], corners[1], corners[2]],
        [corners[0], corners[2], corners[3]],
        [corners[0], corners[3], corners[1]],
        [corners[1], corners[3], corners[2]]
    ];

    let objIndex = 0;
    // Distribute objects across the 4 faces
    for (let f = 0; f < 4; f++) {
        const A = faces[f][0];
        const B = faces[f][1];
        const C = faces[f][2];

        // Arrange in rows (1 item, then 2 items, then 3...) to form a triangle
        // We have roughly 160 items, so ~40 items per face.
        // Rows: 1+2+3+4+5+6+7+8 = 36 items. Approx 8 or 9 rows deep.

        let rowLimit = 9;
        for (let row = 0; row <= rowLimit; row++) {
            for (let col = 0; col <= row; col++) {
                if (objIndex >= objects.length) break;

                const object = new THREE.Object3D();

                // Barycentric coordinates to interpolate position on the triangle
                // We move from top (A) down to base (B-C)
                const s = row / rowLimit; // 0 to 1 (vertical progress)
                const t = (col / (row + 1)) || 0.5; // Horizontal progress inside the row

                // Interpolate
                // P = A + s * ((B + (C-B)*t) - A) ... roughly
                // Cleaner Vector math:
                const p1 = new THREE.Vector3().lerpVectors(B, C, col / (row + 1 || 1)); // Point on base line
                const pos = new THREE.Vector3().lerpVectors(A, p1, s);

                object.position.copy(pos);

                // Make object look outwards from the center of the pyramid (0,0,0)
                // object.lookAt(new THREE.Vector3(0,0,0)); // Look Inward
                object.lookAt(object.position.clone().multiplyScalar(2)); // Look Outward

                targets.pyramid.push(object);
                objIndex++;
            }
        }
    }

    // --- RENDERER & CONTROLS ---
    renderer = new THREE.CSS3DRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('container').appendChild(renderer.domElement);

    // Switch to OrbitControls for better Mouse/Touchpad support
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // Smooth inertia
    controls.dampingFactor = 0.05;
    controls.minDistance = 500;
    controls.maxDistance = 6000;

    // OrbitControls standard: Left=Rotate, Right=Pan, Wheel=Zoom
    // Pan works much better for "scrolling down" than Trackball.

    controls.addEventListener('change', render);

    // Initial Transform to Table
    transform(targets.table, 2000);

    // Event Listeners for Buttons
    document.getElementById('table').addEventListener('click', () => transform(targets.table, 2000));
    document.getElementById('sphere').addEventListener('click', () => transform(targets.sphere, 2000));
    document.getElementById('helix').addEventListener('click', () => transform(targets.helix, 2000));
    document.getElementById('grid').addEventListener('click', () => transform(targets.grid, 2000));
    document.getElementById('pyramid').addEventListener('click', () => transform(targets.pyramid, 2000));

    window.addEventListener('resize', onWindowResize, false);

    animate();
}

function transform(targets, duration) {
    TWEEN.removeAll();
    for (let i = 0; i < objects.length; i++) {
        const object = objects[i];
        const target = targets[i];

        if (!target) continue; // Safety if data < grid slots

        new TWEEN.Tween(object.position)
            .to({ x: target.position.x, y: target.position.y, z: target.position.z }, Math.random() * duration + duration)
            .easing(TWEEN.Easing.Exponential.InOut)
            .start();

        // Rotation is now handled in render() for Billboarding
        // new TWEEN.Tween(object.rotation)
        //     .to({ x: target.rotation.x, y: target.rotation.y, z: target.rotation.z }, Math.random() * duration + duration)
        //     .easing(TWEEN.Easing.Exponential.InOut)
        //     .start();
    }

    new TWEEN.Tween({})
        .to({}, duration * 2)
        .onUpdate(render)
        .start();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    render();
}

function animate() {
    requestAnimationFrame(animate);
    TWEEN.update();
    controls.update();
}

function render() {
    // Billboard Logic: Always face the camera
    for (let i = 0; i < objects.length; i++) {
        objects[i].lookAt(camera.position);
    }
    renderer.render(scene, camera);
}

document.addEventListener("DOMContentLoaded", () => {
    if (window.VANTA) {
        loginEffect = window.VANTA.NET({
            el: "#login-overlay", // Target the login screen
            mouseControls: true,
            touchControls: true,
            gyroControls: false,
            minHeight: 200.00,
            minWidth: 200.00,
            scale: 1.00,
            scaleMobile: 1.00,
            color: 0x00e5ff,       // Your Cyan Color
            backgroundColor: 0x050505, // Your Deep Black Background
            points: 12.00,
            maxDistance: 22.00,
            spacing: 18.00
        });
    }
});