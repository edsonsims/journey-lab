/** Read only a journey's retained conditions. Never resolve today's catalog. */
export function recordedDeviceContext(run = {}) {
  const snapshot = run.deviceSnapshot || null;
  const viewport = snapshot?.viewport || run.viewport || run.personaSnapshot?.viewport || run.persona?.viewport || run.environmentSnapshot?.viewport || null;
  const category = snapshot?.category;
  const width = viewport?.width;
  const device = category === 'phone' ? 'mobile' : ['tablet', 'desktop'].includes(category) ? category
    : ['mobile', 'tablet', 'desktop'].includes(run.device) ? run.device
    : Number.isFinite(width) ? width <= 600 ? 'mobile' : width <= 1024 ? 'tablet' : 'desktop' : 'unknown';
  return {
    device, viewport,
    deviceId: run.deviceId || snapshot?.id || null,
    deviceName: snapshot?.name || run.deviceName || (viewport ? `Custom ${device} · ${viewport.width} × ${viewport.height}` : 'Device not recorded'),
    deviceVersion: run.deviceVersion ?? snapshot?.version ?? null,
    deviceSnapshot: snapshot,
    networkProfileId: run.networkProfileId || run.networkProfileSnapshot?.id || null,
    networkProfileName: run.networkProfileSnapshot?.name || run.networkProfileName || null,
    networkProfileVersion: run.networkProfileVersion ?? run.networkProfileSnapshot?.version ?? null,
    networkProfileSnapshot: run.networkProfileSnapshot || null,
  };
}

/** Identity plus effective settings keep different recorded conditions out of one aggregate row. */
export function recordedConditionsKey(run = {}) {
  const context = recordedDeviceContext(run);
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return JSON.stringify(canonical(context));
}
