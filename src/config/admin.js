export const ADMIN_UID = "9WrxscYANRONmafFHyQ0IbS6Zrw1";

export function isAdmin(user) {
  return user?.uid === ADMIN_UID;
}
