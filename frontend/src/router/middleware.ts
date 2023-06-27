import {logDebug} from "@/tastebuddy";

export const logMiddleware = (to: any, from: any) => {
    logDebug('router', `routing from ${from.path} -> ${to.path}`)
}

/**
 * Vue Router middleware to check if user is authenticated
 * @returns
 * @param to
 * @param from
 * @param next
 * @param store
 */
export const checkAuthMiddleware = (to: any, from: any, next: any, store: any) => {
    if (to.meta.auth) {
        store.sessionAuth().then((isAuthenticated: boolean) => {
            logDebug('router', `auth required for ${to.path} -> ${isAuthenticated}`)
            if (isAuthenticated) {
                next()
            } else {
                const redirect = to.query.redirect ? to.query.redirect : to.path;
                next({name: 'Login', query: {redirect: redirect}});
            }
        })
    } else {
        next();
    }
}