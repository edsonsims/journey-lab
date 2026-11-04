import type {Row} from './lib.ts';
import {recordedDevice,recordedNetwork} from './device-context.ts';

/** Compare the settings actually retained with the journey, never the live catalog. */
export function recordedConditionsKey(run:Row):string {
 const device=recordedDevice(run),network=recordedNetwork(run);
 return JSON.stringify([
  device.browser??null,device.viewport?.width??null,device.viewport?.height??null,
  device.screen?.width??null,device.screen?.height??null,device.deviceScaleFactor??null,
  device.isMobile??null,device.hasTouch??null,device.userAgent||null,
  network.unrecorded?'unrecorded':[network.offline===true,network.latencyMs??0,network.downloadMbps??null,network.uploadMbps??null]
 ]);
}
