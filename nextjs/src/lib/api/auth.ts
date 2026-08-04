// Домен: авторизация и пользователи.
import { getArray, getOne, post } from './http'

export const login = (b: { email: string; password: string }) => post('/api/auth/login', b)
export const logout = () => post('/api/auth/logout')
export const me = () => getOne('/api/auth/me')

export const listUsers = () => getArray('/api/users')
export const createUser = (b: any) => post('/api/users', b)
