const sessions = new Map();

export const getSession = (guildId) => sessions.get(guildId);
export const setSession = (guildId, session) => sessions.set(guildId, session);
export const deleteSession = (guildId) => sessions.delete(guildId);
