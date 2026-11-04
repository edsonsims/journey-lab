import {TargetNotResolved} from './experience-recorder.mjs';
// Only the driver's explicitly recoverable grounding failures may be retried.
// Input safety rejections and other errors must follow their normal stop path.
export function groundingRejectionFeedback(error) {
  return error instanceof TargetNotResolved && error.recoverable === true
    ? 'A ação NÃO foi executada: o controle não foi localizado de forma única e acessível. Reveja o rótulo visível na nova captura ou use coordenadas.'
    : null;
}
