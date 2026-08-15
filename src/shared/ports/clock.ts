export interface Clock {
  agora(): Date;
}

export const clockDoSistema: Clock = {
  agora: () => new Date(),
};
