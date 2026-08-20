export const PASSWORD_CHANGE_FIELD = {
  currentPassword: 'currentPassword',
  newPassword: 'newPassword',
  passwordConfirmation: 'passwordConfirmation',
} as const;

export const PASSWORD_CHANGE_MESSAGES = {
  currentPassword: 'Informe a senha atual.',
  newPassword: 'Informe a senha nova.',
  passwordConfirmation: 'Repita a senha nova.',
  mismatch: 'A confirmação não confere com a senha nova.',
} as const;

export const PASSWORD_CHANGED = 'Senha alterada.';

export const SHOW_OR_HIDE = {
  currentPassword: 'Mostrar ou ocultar a senha atual',
  newPassword: 'Mostrar ou ocultar a senha nova',
  passwordConfirmation: 'Mostrar ou ocultar a confirmação',
} as const;
