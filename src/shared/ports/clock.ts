export interface Clock {
  agora(): Date;
}

/**
 * Único ponto do sistema que lê o relógio real. Casos de uso recebem um Clock em vez de
 * chamar `new Date()` para que "expirou?" e "de que bimestre é hoje?" sejam testáveis.
 */
export const clockDoSistema: Clock = {
  agora: () => new Date(),
};
