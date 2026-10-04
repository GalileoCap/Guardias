const ID = /^[A-Za-z0-9_-]{16,64}$/

/** Grupo compartido de la URL (?group=<id>); null = modo local, solo en este navegador. */
export const GROUP: string | null = (() => {
  const g = new URLSearchParams(location.search).get('group')
  return g && ID.test(g) ? g : null
})()

/** Id nuevo e impredecible (128 bits): quien tenga el enlace puede editar, así que el id es el secreto. */
export const newGroupId = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
