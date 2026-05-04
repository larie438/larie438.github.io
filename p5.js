const mapWidth = 1800;
const mapHeight = 1200;
let bg;

let dayArray = [];
let flightArray = [];
let pointCount = 0;

let daySelector = 0;
let flightSelector = 0;

let cnv;

//these values can be pulled from attributes of objects like images and videos, they're just hard-coded here since the example is using a rectangle
let assetWidth = 1800;
let assetHeight = 1200;

//variables to hold aspect ratios and output coords and size
let assetRatio = assetWidth / assetHeight;
let canvasRatio;
let assetDisplayW;
let assetDisplayH;
let assetX;
let assetY;

const edges = {
    minLong: 68.44000,
    maxLong: 69.93296,
    minLat: 34.26000,
    maxLat: 34.906933,
}

let allFlights = {}

let currentFlight = null

function preload() {

    bg = loadImage('assets/map_small.png');

    loadJSON("/data/allDays.json", function (days) {

        // once days are loaded; display days
        // console.log("days are loaded",days)

        for (let d = 0; d < days.length; d++) {
            const day = days[d];
            let dayFlights = {}

            loadJSON(
                "/data/days/" + day.day + "_flights.json", // which file to open
                function (flights_of_day) { // what to do if found

                    for (let f = 0; f < flights_of_day.length; f++) {

                        let flight = flights_of_day[f];

                        dayFlights[flight.flight_id] = flight

                        loadJSON("/data/flights/" + day.day + "/" + day.day + "_" + flight.flight_id + ".json", function (flight_data) {
                            // console.log(flight_data)
                            dayFlights[flight.flight_id]["route"] = flight_data
                        })
                    }

                }
            )

            allFlights[day.day] = {
                flights: dayFlights
            }
        }
    });
}

function getFlightData(day, id) {
    currentFlight = allFlights[day].flights[id]
    // console.log(currentFlight)
}

function setup() {
    // frameRate(30);
    cnv = createCanvas(mapWidth, mapHeight);
    cnv.parent('myContainer');
    background(bg);

    // noLoop()

    //2d array
    for (var day in allFlights) {
        if (allFlights.hasOwnProperty(day)) {
            console.log(day + " -> " + allFlights[day]);
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
    // console.log("LOADED");
}

function drawFlight() {
    // background(bg); // re-draw background every flight
    if (flightSelector < flightArray[daySelector].length - 1) {
        flightSelector++;
        // if i want random colors insert here and use hsb color spece
        console.log(flightSelector);
    } else {
        flightSelector = 0
        if (daySelector < dayArray.length - 1) {
            daySelector++;
            // background(bg);
            image(bg, assetX, assetY, assetDisplayW, assetDisplayH);
        }
    }
    getFlightData(dayArray[daySelector], flightArray[daySelector][flightSelector]);
}

function draw() {

    noFill()
    stroke("red")

    strokeWeight(1);

    if (currentFlight) {

        beginShape();
        if (pointCount < currentFlight.route.length) {
            for (let i = 0; i < pointCount; i++) {

                const routePoint = currentFlight.route[i]

                let x = map(routePoint.longitude, edges.minLong, edges.maxLong, assetX, assetX + assetDisplayW)
                let y = map(routePoint.latitude, edges.maxLat, edges.minLat, assetY, assetY + assetDisplayH)


                if (x >= 0 && x <= assetX + assetDisplayW && y >= 0 && y <= assetY + assetDisplayH) {
                    vertex(x, y)
                }
            }
            pointCount++;


            endShape();
        } else {
            pointCount = 0;
            drawFlight();
        }
    }

    //recalculate canvas aspect ratio in the draw function so that it can update if the canvas is resized
    canvasRatio = width / height;

    //compare canvas and asset aspect ratios to determine whether we need to "letterbox" on the top/bottom, or sides
    if (assetRatio > canvasRatio) { //letterbox on top and bottom
        assetDisplayW = width;
        assetDisplayH = width / assetRatio;
    } else { //letterbox on sides
        assetDisplayH = height;
        assetDisplayW = height * assetRatio;
    }

    //calculate the coords of top left corner
    assetX = (width - assetDisplayW) / 2;
    assetY = (height - assetDisplayH) / 2;
}

//enter fullscreen when spacebar (keycode 32) is pressed
function keyPressed() {
    if (keyCode == 32) {
        let fs = fullscreen();
        fullscreen(!fs);
    }
}

//resize canvas if window changes size
function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    image(bg, assetX, assetY, assetDisplayW, assetDisplayH);
}