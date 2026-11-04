import { statfs, mkdir } from 'node:fs/promises';

const GiB=1024**3;
export class CaptureCapacityError extends Error {
  constructor(message,code='CAPTURE_CAPACITY_LOW'){super(message);this.code=code;this.status=507;}
}

// Capacity is a preflight, not a quota or a promise that another process cannot
// fill the disk. Existing files are never removed to make room for a capture.
export function createCaptureCapacity({root,readSpace=statfs,reserveBytes=2*GiB,captureAllowanceBytes=GiB}={}){
  if(!root)throw new TypeError('A capture directory is required.');
  async function inspect(){
    try{
      await mkdir(root,{recursive:true});
      const space=await readSpace(root,{bigint:true});
      const freeBytes=Number(BigInt(space.bavail)*BigInt(space.bsize));
      const totalBytes=Number(BigInt(space.blocks)*BigInt(space.bsize));
      if(!Number.isSafeInteger(freeBytes)||freeBytes<0||!Number.isSafeInteger(totalBytes)||totalBytes<=0)throw new Error();
      const requiredBytes=reserveBytes+captureAllowanceBytes;
      return {status:freeBytes>=requiredBytes?'ready':'low',freeBytes,totalBytes,usedBytes:Math.max(0,totalBytes-freeBytes),reserveBytes,captureAllowanceBytes,requiredBytes,retention:'keep-all',checkedAt:new Date().toISOString()};
    }catch{return {status:'unknown',retention:'keep-all',reserveBytes,captureAllowanceBytes,checkedAt:new Date().toISOString()};}
  }
  async function assertAvailable(){
    const result=await inspect();
    if(result.status==='unknown')throw new CaptureCapacityError('Storage capacity could not be verified. New capture was paused; existing recordings are retained.','CAPTURE_CAPACITY_UNKNOWN');
    if(result.status!=='ready')throw new CaptureCapacityError('Storage is running low. Free space or move this workspace before starting another capture. Existing recordings are retained.');
    return result;
  }
  return {inspect,assertAvailable};
}
