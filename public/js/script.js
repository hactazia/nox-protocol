import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.163.0/+esm';
import Client from './client.js';

let scene, camera, renderer, text, client, socket;

const DEFAULT_PRECISION = 6;
function roundFloat(value, precision = DEFAULT_PRECISION) {
    let multiplier = Math.pow(10, precision);
    return Math.round(value * multiplier) / multiplier;
}

window.addEventListener('load', async function () {
    const width = window.innerWidth, height = window.innerHeight;
    text = document.getElementById('console');
    camera = new THREE.PerspectiveCamera(70, width / height, 0.01, 100);
    camera.position.z = 1;

    scene = new THREE.Scene();

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setAnimationLoop(animation);
    document.body.appendChild(renderer.domElement);

    // on resize
    window.addEventListener('resize', function () {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // on click, hide cursor
    window.addEventListener('click', function () {
        renderer.domElement.requestPointerLock();
    });

    // on escape, show cursor
    window.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') document.exitPointerLock();
    });

    // on mouse move, update camera rotation
    window.addEventListener('mousemove', function (e) {
        if (document.pointerLockElement === renderer.domElement) {
            // rotate camera with max angle verticaly and keep horizontal angle
            camera.rotation.x -= e.movementY / 500;
            camera.rotation.y -= e.movementX / 500;
            camera.rotation.order = 'YXZ';
            camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));
        }
    });

    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial({ color: 0x0000ff });
    const cube = new THREE.Mesh(geometry, material);
    // scene.add(cube);
    cube.position.z = -0.5;

    renderer.setAnimationLoop(animation);
    socket = io();
    client = new Client(socket);

    var c = await client.connect('localhost', 12345);
    var h = await client.sendHandshake();
    var l = await client.sendLogin({ token: 'rfejen7251/90Clku3dgtXfENSavv9Oef7NcTC+ryug6dzv0DO32kXjHxDq5HzAT5LhrAm7Tvyft2/575DsSig==' });

    var s = await client.sendStatus();
    var j = await client.sendInstanceEnter(s.serialized.instances[0].internal_id);

});

let cameraVelocity = new THREE.Vector3(0, 0, 0);
let speed = 0.1;
let friction = 0.75;

let keys = {
    'z': false,
    's': false,
    'q': false,
    'd': false,
    ' ': false,
    'Shift': false
};
window.addEventListener('keydown', function (e) {
    if (typeof keys[e.key] === 'boolean') keys[e.key] = true;
});
window.addEventListener('keyup', function (e) {
    if (typeof keys[e.key] === 'boolean') keys[e.key] = false;
});

let ptime = 0;
function animation(time) {
    const delta = time - ptime;
    ptime = time;

    // forward vector of camera
    let forward = new THREE.Vector3(0, 0, -1);
    forward.applyEuler(camera.rotation);
    forward.normalize();

    // right vector of camera
    let right = new THREE.Vector3(1, 0, 0);
    right.applyEuler(camera.rotation);
    right.normalize();

    // up vector of camera
    let up = new THREE.Vector3(0, 1, 0);
    up.applyEuler(camera.rotation);
    up.normalize();

    // move camera
    if (keys['z']) cameraVelocity.add(forward.clone().multiplyScalar(speed));
    if (keys['s']) cameraVelocity.add(forward.clone().multiplyScalar(-speed));
    if (keys['q']) cameraVelocity.add(right.clone().multiplyScalar(-speed));
    if (keys['d']) cameraVelocity.add(right.clone().multiplyScalar(speed));
    if (keys[' ']) cameraVelocity.add(up.clone().multiplyScalar(speed));
    if (keys['Shift']) cameraVelocity.add(up.clone().multiplyScalar(-speed));

    text.innerHTML = [
        'Position: ' + camera.position.toArray().map(v => roundFloat(v)).join(', '),
        'Velocity: ' + cameraVelocity.toArray().map(v => roundFloat(v)).join(', '),
        'FPS: ' + Math.floor(delta) + 'fps',
        ...Array.from(client.transforms.values()).map(t => t.path
            + '<br>  (' + Object.values(t.position).map(v => roundFloat(v)).join(', ') + ')'
            + '<br>  (' + Object.values(t.rotation).map(v => roundFloat(v)).join(', ') + ')'
            + '<br>  (' + Object.values(t.scale).map(v => roundFloat(v)).join(', ') + ')'
        )
    ].join('<br>').replace(/ /g, '&nbsp;')

    for (let transform of client.transforms.values()) {
        let obj = scene.getObjectByProperty('uuid', transform.path);
        if (obj) {
            obj.position.fromArray(Object.values(transform.position));
            obj.quaternion.fromArray(Object.values(transform.rotation));
        } else {
            console.log('new object', transform.path);
            const geometry = new THREE.BoxGeometry();
            const material = new THREE.MeshBasicMaterial({ color: 0x0000ff });
            const cube = new THREE.Mesh(geometry, material);
            cube.position.fromArray(Object.values(transform.position));
            cube.quaternion.fromArray(Object.values(transform.rotation));
            cube.scale.fromArray(Object.values(transform.scale).map(v => v / 10));
            cube.uuid = transform.path;
            scene.add(cube);
            // add line to object
            const points = [];
            points.push(new THREE.Vector3(0, 0, 0));
            points.push(new THREE.Vector3(0, 0, 5));
            const li = new THREE.BufferGeometry().setFromPoints(points);
            var line = new THREE.Line(li, new THREE.LineBasicMaterial({ color: 0x00ff00 }));
            cube.add(line);
        }
    }



    camera.position.add(cameraVelocity);
    cameraVelocity.multiplyScalar(friction);
    camera.position.x = roundFloat(camera.position.x);
    camera.position.y = roundFloat(camera.position.y);
    camera.position.z = roundFloat(camera.position.z);
    renderer.render(scene, camera);
}