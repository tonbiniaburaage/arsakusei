# AprilTag WebAssembly notice

This directory contains `apriltag_wasm.js` and `apriltag_wasm.wasm` from
[`arenaxr/apriltag-js-standalone`](https://github.com/arenaxr/apriltag-js-standalone),
which compiles the reference [`AprilRobotics/apriltag`](https://github.com/AprilRobotics/apriltag)
detector to WebAssembly. The upstream software is distributed under the
BSD-3-Clause license reproduced in `LICENSE`.

`apriltag-worker.js` is the project-specific worker bridge. It runs the
detector off the UI thread and configures only the tag36h11 family needed by
this experience.
