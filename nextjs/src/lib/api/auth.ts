// Домен: авторизация и пользователи.
import { getArray, getOne, post, send } from './http'

export const login = (b: { email: string; password: string }) => post('/api/auth/login', b)
export const logout = () => post('/api/auth/logout')
export const me = () => getOne('/api/auth/me')

export const listUsers = () => getArray('/api/users')
export const createUser = (b: any) => post('/api/users', b)
export const editUser = (id: string, b: any) => send(`/api/users/${id}`, 'PUT', b)
export const deleteUser = (id: string) => send(`/api/users/${id}`, 'DELETE')
