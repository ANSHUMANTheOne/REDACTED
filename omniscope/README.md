# OmniScope

OmniScope compares real NASA/IPAC SPHEREx FITS observations for the NASA Space Apps Planet X challenge. The solar-system view uses NASA JPL reference positions.


## Time-lapse Lab (added)
Open with the "▶ Time-lapse lab" button, or by URL: `?lab=1&ra=269.452&dec=4.77&fov=.4&det=3&mode=trail&band=3-5`.
- Movie / trail (new epoch over faded older ones) / running sum / subtract first or previous epoch (same detector only).
- Stack by exposure, 7-day, 30-day, or per detector. 6 detectors x 17 channels = 102 band picker.
- Click the image to pin a source and plot its spectrum from every exposure.
- Overlays: Gaia DR3 and AllWISE (via `/api/catalog`, proper motion applied per frame). Name lookup via CDS Sesame.
- New data release: append its IRSA collection name to `COLLECTIONS` in `public/timelapse-lab.js`.
