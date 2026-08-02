// NOTE: The direct browser -> Transloadit upload + Socket.IO realtime
// status subscription that used to live in this file has been removed.
// In practice, Transloadit's per-assembly worker subdomain (the
// `websocket_url` returned on assembly creation) 404'd on its own
// Socket.IO endpoint for some assemblies/regions — on both the websocket
// and polling transports — which is a gap on Transloadit's side, not a
// proxy/network issue (confirmed via direct inspection: the request
// reached Transloadit's own domain and Transloadit's own server returned
// the 404).
//
// Image uploads now go through this app's own backend instead: the
// browser calls POST /api/upload-image, which triggers the `upload-image`
// Trigger.dev task (src/trigger/uploadImage.ts) — reusing the exact same
// wait.createToken()/notify_url webhook/wait.forToken() pattern already
// proven working in production for the crop-image task
// (src/lib/transloadit-server-upload.ts) — and the browser watches it via
// Trigger.dev Realtime (useRealtimeRun) through the useTransloaditUpload
// hook (src/hooks/useTransloaditUpload.ts), not a direct connection to
// Transloadit's realtime infrastructure. See that hook for the actual
// upload entry point call sites should use.

export const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/jpg,image/png,image/webp,image/gif";