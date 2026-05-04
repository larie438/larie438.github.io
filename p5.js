// ============================================================
// CANVAS & MAP DIMENSIONS
// Fixed size of the canvas and the source map image
// ============================================================
const mapWidth = 1800;
const mapHeight = 1200;
let bg;

// ============================================================
// FLIGHT NAVIGATION STATE
// Arrays to index all days and flights, plus selectors
// to track which day and flight is currently being drawn
// ============================================================
let dayArray = [];
let flightArray = [];
let pointCount = 0;

let daySelector = 0;
let flightSelector = 0;

let cnv;

// ============================================================
// ASSET DISPLAY VARIABLES
// Used to scale and letterbox the map correctly inside
// the canvas regardless of window size
// ============================================================
let assetWidth = 1800;
let assetHeight = 1200;

let assetRatio = assetWidth / assetHeight;
let canvasRatio;
let assetDisplayW;
let assetDisplayH;
let assetX;
let assetY;

// ============================================================
// GEOGRAPHIC BOUNDING BOX
// Defines the lat/long edges of the map image.
// Used to convert GPS coordinates to canvas pixel positions
// ============================================================
const edges = {
    minLong: 68.44000,
    maxLong: 69.93296,
    minLat: 34.26000,
    maxLat: 34.906933,
}

// ============================================================
// DATA STORE
// allFlights holds all loaded JSON data organized by day.
// currentFlight is the flight currently being animated
// ============================================================
let allFlights = {}
let currentFlight = null

// ============================================================
// ANIMATION SPEED
// frameDelay counts frames between each point advance.
// SPEED = 1 means one new point drawn per frame (fastest)
// ============================================================
let frameDelay = 0;
const SPEED = 1;

// ============================================================
// GRAPHICS LAYERS
// trailsLayer: permanent — flight paths accumulate here
// arrowLayer: cleared every frame — only holds the arrowhead
// ============================================================
let trailsLayer;
let arrowLayer;

// ============================================================
// UI & SUMMARY STATE
// lastFlightInfo caches the info panel data to prevent
// flickering between flights.
// summaryMode triggers the full overview at the end of all days
// ============================================================
let lastFlightInfo = null;

let summaryMode = false;
let summaryTimer = 0;
const SUMMARY_DURATION = 30 * 60; // 30 seconds at 60fps

// ============================================================
// ARROWHEAD TRACKING
// Stores the last two valid on-screen points to calculate
// the direction angle for the arrowhead
// ============================================================
let lastValidX, lastValidY, prevValidX, prevValidY;

// ============================================================
// PRELOAD
// Loads the map image and all flight JSON data before setup().
// Data is nested: days → flights per day → route per flight
// ============================================================
function preload() {
    bg = loadImage('assets/map_small.png');

    loadJSON("/data/allDays.json", function (days) {
        for (let d = 0; d < days.length; d++) {
            const day = days[d];
            let dayFlights = {}

            loadJSON(
                "/data/days/" + day.day + "_flights.json",
                function (flights_of_day) {
                    for (let f = 0; f < flights_of_day.length; f++) {
                        let flight = flights_of_day[f];
                        dayFlights[flight.flight_id] = flight
                        loadJSON("/data/flights/" + day.day + "/" + day.day + "_" + flight.flight_id + ".json", function (flight_data) {
                            dayFlights[flight.flight_id]["route"] = flight_data
                        })
                    }
                }
            )
            allFlights[day.day] = { flights: dayFlights }
        }
    });
}

// ============================================================
// GET FLIGHT DATA
// Sets currentFlight to the selected flight and caches
// the landing/takeoff result so isLanding() only runs once
// per flight instead of every frame
// ============================================================
function getFlightData(day, id) {
    currentFlight = allFlights[day].flights[id];
    currentFlight._isLanding = isLanding(currentFlight.route);
    lastValidX = undefined;
    lastValidY = undefined;
    prevValidX = undefined;
    prevValidY = undefined;
}

// ============================================================
// SETUP
// Creates the canvas, graphics layers, and builds the
// dayArray and flightArray indexes from loaded data.
// Calls drawFlight() to begin the animation
// ============================================================
function setup() {
    cnv = createCanvas(mapWidth, mapHeight);
    cnv.parent('myContainer');
    background(bg);

    trailsLayer = createGraphics(mapWidth, mapHeight);
    arrowLayer  = createGraphics(mapWidth, mapHeight);

    for (var day in allFlights) {
        if (allFlights.hasOwnProperty(day)) {
            dayArray.push(day);
        }
    }
    for (let i = 0; i < dayArray.length; i++) {
        flightArray[i] = [];
        for (var flights in allFlights[dayArray[i]]['flights']) {
            if (allFlights[dayArray[i]]['flights'].hasOwnProperty(flights)) {
                flightArray[i].push(flights);
            }
        }
    }

    drawFlight();

    // estimate total animation duration based on route data
    // let totalPoints = 0;
    // let totalFlights = 0;
    // for (let d = 0; d < dayArray.length; d++) {
    //     for (let f = 0; f < flightArray[d].length; f++) {
    //         const flight = allFlights[dayArray[d]].flights[flightArray[d][f]];
    //         if (flight.route) {
    //             totalPoints += flight.route.length;
    //             totalFlights++;
    //         }
    //     }
    // }
    // const totalSeconds = totalPoints / 60;
    // console.log("Flights:", totalFlights);
    // console.log("Total points:", totalPoints);
    // console.log("Estimated time:", (totalSeconds / 60).toFixed(1), "minutes");
}

// ============================================================
// DRAW FLIGHT
// Advances to the next flight or next day.
// Clears the trails layer between days.
// Triggers summary mode after the last flight of the last day
// ============================================================
function drawFlight() {
    if (flightSelector < flightArray[daySelector].length - 1) {
        flightSelector++;
    } else {
        flightSelector = 0;
        if (daySelector < dayArray.length - 1) {
            daySelector++;
            trailsLayer.clear();
            arrowLayer.clear();
            image(bg, assetX, assetY, assetDisplayW, assetDisplayH);
        } else {
            summaryMode = true;
            summaryTimer = 0;
            trailsLayer.clear();
            arrowLayer.clear();
            drawAllRoutes();
            return;
        }
    }
    getFlightData(dayArray[daySelector], flightArray[daySelector][flightSelector]);
}

// ============================================================
// IS LANDING
// Determines if a flight is landing or taking off by comparing
// average altitude in the first vs last quarter of route points
// that fall within the Kabul bounding box.
// Returns true if altitude drops toward the end (landing)
// ============================================================
function isLanding(route) {
    if (!route || route.length < 2) return false;

    const kabulPoints = route.filter(p =>
        p.longitude >= edges.minLong && p.longitude <= edges.maxLong &&
        p.latitude  >= edges.minLat  && p.latitude  <= edges.maxLat
    );

    if (kabulPoints.length < 4) return false;

    const quarter = Math.floor(kabulPoints.length / 4);

    let firstAvg = 0;
    for (let i = 0; i < quarter; i++) {
        firstAvg += kabulPoints[i].altitude || kabulPoints[i].alt || 0;
    }
    firstAvg /= quarter;

    let lastAvg = 0;
    for (let i = kabulPoints.length - quarter; i < kabulPoints.length; i++) {
        lastAvg += kabulPoints[i].altitude || kabulPoints[i].alt || 0;
    }
    lastAvg /= quarter;

    return lastAvg < firstAvg;
}

// ============================================================
// ALTITUDE COLOR
// Maps altitude to a color gradient.
// Landings use red (dark at low alt, bright at high alt).
// Takeoffs use green (dark at low alt, bright at high alt)
// ============================================================
function altitudeColor(altitude, landing) {
    const maxAlt = 12000;
    const t = constrain(altitude / maxAlt, 0, 1);

    if (landing) {
        return trailsLayer.color(
            lerp(60, 220, t),
            lerp(10, 50, t),
            lerp(10, 50, t)
        );
    } else {
        return trailsLayer.color(
            lerp(10, 50, t),
            lerp(50, 200, t),
            lerp(15, 80, t)
        );
    }
}

// ============================================================
// DRAW ALL ROUTES
// Called during summary mode. Draws every route of every
// flight across all days at once onto the trails layer,
// then composites it over the map background
// ============================================================
function drawAllRoutes() {
    image(bg, assetX, assetY, assetDisplayW, assetDisplayH);

    for (let d = 0; d < dayArray.length; d++) {
        const day = dayArray[d];
        for (let id in allFlights[day].flights) {
            const flight = allFlights[day].flights[id];
            if (!flight.route || flight.route.length < 2) continue;

            const landing = flight._isLanding !== undefined
                ? flight._isLanding
                : isLanding(flight.route);

            trailsLayer.noFill();
            trailsLayer.strokeWeight(2);

            for (let i = 1; i < flight.route.length; i++) {
                const p    = flight.route[i];
                const prev = flight.route[i - 1];

                let x  = map(p.longitude,    edges.minLong, edges.maxLong, assetX, assetX + assetDisplayW);
                let y  = map(p.latitude,     edges.maxLat,  edges.minLat,  assetY, assetY + assetDisplayH);
                let px = map(prev.longitude, edges.minLong, edges.maxLong, assetX, assetX + assetDisplayW);
                let py = map(prev.latitude,  edges.maxLat,  edges.minLat,  assetY, assetY + assetDisplayH);

                if (x  >= 0 && x  <= assetX + assetDisplayW && y  >= 0 && y  <= assetY + assetDisplayH &&
                    px >= 0 && px <= assetX + assetDisplayW && py >= 0 && py <= assetY + assetDisplayH) {
                    let alt = p.altitude || p.alt || 0;
                    trailsLayer.stroke(altitudeColor(alt, landing));
                    trailsLayer.line(px, py, x, y);
                }
            }
        }
    }
    image(trailsLayer, 0, 0);
}

// ============================================================
// DRAW FLIGHT INFO
// Renders the info panel in the top left corner.
// Caches the last valid data in lastFlightInfo so the panel
// stays visible and stable between flight transitions
// ============================================================
function drawFlightInfo() {
    if (currentFlight && currentFlight.route && pointCount >= 1) {
        const routePoint = currentFlight.route[pointCount - 1];
        if (routePoint) {
            const raw = dayArray[daySelector];
            lastFlightInfo = {
                date:     raw.slice(6,8) + '-' + raw.slice(4,6) + '-' + raw.slice(0,4),
                callsign: currentFlight.callsign                          || "",
                flight:   currentFlight.flight                            || "",
                equip:    currentFlight.equip                             || "",
                from:     currentFlight.schd_from                         || "",
                to:       currentFlight.schd_to || currentFlight.real_to  || "",
                alt:      routePoint.altitude || routePoint.alt           || 0,
                heading:  routePoint.heading                              || "",
                speed:    (routePoint.speed                               || "") + " kt",
                lat:      nf(routePoint.latitude, 1, 5),
                lon:      nf(routePoint.longitude, 1, 5),
                squawk:   routePoint.squawk                               || "",
            };
        }
    }

    if (!lastFlightInfo) return;

    const lines = [
        ["DATE",     lastFlightInfo.date],
        ["CALLSIGN", lastFlightInfo.callsign],
        ["FLIGHT",   lastFlightInfo.flight],
        ["EQUIP",    lastFlightInfo.equip],
        ["FROM",     lastFlightInfo.from],
        ["TO",       lastFlightInfo.to],
        ["ALT",      lastFlightInfo.alt + " m"],
        ["HEADING",  lastFlightInfo.heading],
        ["SPEED",    lastFlightInfo.speed],
        ["LAT",      lastFlightInfo.lat],
        ["LON",      lastFlightInfo.lon],
        ["SQUAWK",   lastFlightInfo.squawk],
    ];

    const padding  = 12;
    const lineH    = 18;
    const colLabel = 80;
    const colValue = 130;
    const boxW     = colLabel + colValue + padding * 2;
    const boxH     = lines.length * lineH + padding * 2;

    noStroke();
    fill(0, 0, 0, 160);
    rect(10, 10, boxW, boxH, 4);

    textFont('monospace');
    textSize(12);
    for (let i = 0; i < lines.length; i++) {
        const yPos = 10 + padding + 12 + i * lineH;
        fill(180, 180, 180);
        text(lines[i][0], 10 + padding, yPos);
        fill(255);
        text(lines[i][1], 10 + padding + colLabel, yPos);
    }
}

// ============================================================
// DRAW — MAIN LOOP
// Runs every frame. Handles three responsibilities:
// 1. Recalculates aspect ratio and letterbox coordinates
// 2. In summary mode: counts down 30s then restarts
// 3. In normal mode: draws one new line segment per frame,
//    updates the arrowhead, composites all layers, and
//    advances pointCount based on SPEED
// ============================================================
function draw() {

    canvasRatio = width / height;
    if (assetRatio > canvasRatio) {
        assetDisplayW = width;
        assetDisplayH = width / assetRatio;
    } else {
        assetDisplayH = height;
        assetDisplayW = height * assetRatio;
    }
    assetX = (width - assetDisplayW) / 2;
    assetY = (height - assetDisplayH) / 2;

    if (summaryMode) {
        summaryTimer++;
        if (summaryTimer >= SUMMARY_DURATION) {
            summaryMode    = false;
            summaryTimer   = 0;
            daySelector    = 0;
            flightSelector = 0;
            pointCount     = 0;
            frameDelay     = 0;
            lastFlightInfo = null;
            trailsLayer.clear();
            arrowLayer.clear();
            background(bg);
            drawFlight();
        }
        return;
    }

    if (currentFlight && currentFlight.route) {

        const landing     = currentFlight._isLanding;
        const flightColor = landing ? color(220, 50, 50) : color(50, 200, 80);

        if (pointCount < currentFlight.route.length) {

            if (pointCount >= 2) {
                const routePoint = currentFlight.route[pointCount - 1];
                const prevPoint  = currentFlight.route[pointCount - 2];

                let x  = map(routePoint.longitude, edges.minLong, edges.maxLong, assetX, assetX + assetDisplayW);
                let y  = map(routePoint.latitude,  edges.maxLat,  edges.minLat,  assetY, assetY + assetDisplayH);
                let px = map(prevPoint.longitude,  edges.minLong, edges.maxLong, assetX, assetX + assetDisplayW);
                let py = map(prevPoint.latitude,   edges.maxLat,  edges.minLat,  assetY, assetY + assetDisplayH);

                if (x  >= 0 && x  <= assetX + assetDisplayW && y  >= 0 && y  <= assetY + assetDisplayH &&
                    px >= 0 && px <= assetX + assetDisplayW && py >= 0 && py <= assetY + assetDisplayH) {

                    const alt = routePoint.altitude || routePoint.alt || 0;
                    trailsLayer.noFill();
                    trailsLayer.strokeWeight(2);
                    trailsLayer.stroke(altitudeColor(alt, landing));
                    trailsLayer.line(px, py, x, y);

                    prevValidX = lastValidX;
                    prevValidY = lastValidY;
                    lastValidX = x;
                    lastValidY = y;
                }
            }

            arrowLayer.clear();
            if (pointCount < currentFlight.route.length - 1 &&
                lastValidX !== undefined && prevValidX !== undefined) {
                const angle = atan2(lastValidY - prevValidY, lastValidX - prevValidX);
                const arrowSize = 10;
                arrowLayer.push();
                arrowLayer.translate(lastValidX, lastValidY);
                arrowLayer.rotate(angle);
                arrowLayer.fill(flightColor);
                arrowLayer.noStroke();
                arrowLayer.triangle(0, 0, -arrowSize, -arrowSize / 2, -arrowSize, arrowSize / 2);
                arrowLayer.pop();
            }

            image(bg, assetX, assetY, assetDisplayW, assetDisplayH);
            image(trailsLayer, 0, 0);
            image(arrowLayer, 0, 0);
            drawFlightInfo();

            frameDelay++;
            if (frameDelay >= SPEED) {
                pointCount++;
                frameDelay = 0;
            }

        } else {
            pointCount = 0;
            frameDelay = 0;
            drawFlight();
        }
    }
}

// ============================================================
// KEY CONTROLS
// SPACE — toggle fullscreen
// S     — jump to the first flight of the last day
// R     — restart from day 1 flight 1
// ============================================================
function keyPressed() {
    if (keyCode == 32) {
        let fs = fullscreen();
        fullscreen(!fs);
    }
    if (key == 's' || key == 'S') {
        daySelector    = dayArray.length - 1;
        flightSelector = 0;
        pointCount     = 0;
        frameDelay     = 0;
        summaryMode    = false;
        summaryTimer   = 0;
        trailsLayer.clear();
        arrowLayer.clear();
        image(bg, assetX, assetY, assetDisplayW, assetDisplayH);
        getFlightData(dayArray[daySelector], flightArray[daySelector][0]);
    }
    if (key == 'r' || key == 'R') {
        daySelector    = 0;
        flightSelector = 0;
        pointCount     = 0;
        frameDelay     = 0;
        summaryMode    = false;
        summaryTimer   = 0;
        lastFlightInfo = null;
        trailsLayer.clear();
        arrowLayer.clear();
        background(bg);
        getFlightData(dayArray[0], flightArray[0][0]);
    }
}

// ============================================================
// WINDOW RESIZED
// Resizes the canvas to fill the new window dimensions.
// Redraws the background to prevent a blank canvas
// ============================================================
function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    image(bg, assetX, assetY, assetDisplayW, assetDisplayH);
}
