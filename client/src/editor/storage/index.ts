// Vue
import {defineStore} from 'pinia'

import {
    API_ROUTE,
    APIResponse,
    itemFromJSON,
    logDebug,
    presentToast,
    Recipe,
    recipeFromJSON,
    sendToAPI
} from '@/shared';
import {SUPPORT_LOCALES_TYPE} from '@/shared/locales/i18n';
import {MutableRecipe} from '@/editor/types/recipe';
import {MutableItem} from '@/editor/types/item';


// Define typings for the store state

interface UserState {
    user: {
        authenticated: boolean
    },
    language: SUPPORT_LOCALES_TYPE
}

export const useTasteBuddyStore = defineStore('tastebuddy-editor', {
    state: (): UserState => ({
        user: {
            authenticated: false,
        },
        language: 'en'
    }),
    getters: {
        /**
         * Get the current language
         * @param state
         */
        isAuthenticated: (state): boolean => state.user.authenticated ?? false,
    },
    actions: {
        /**
         * Authenticate the user using the session cookie+
         * @return true, if user was authenticated successfully
         */
        async authenticate(): Promise<boolean> {
            logDebug('authenticate', 'logging in')
            // if the user is already authenticated, return true
            if (this.isAuthenticated) {
                return Promise.resolve(true)
            }

            // try to authenticate the user using the session cookie
            return sendToAPI<string>(API_ROUTE.GET_AUTH, {errorMessage: 'Could not log in'})
                .then((apiResponse: APIResponse<string>) => {
                    this.user.authenticated = !apiResponse.error
                    logDebug('sessionAuth', `user is${!this.user.authenticated ? ' not ' : ' '}authenticated`)
                    return this.user.authenticated
                }).catch(() => {
                    this.user.authenticated = false
                    return false
                })
        },
        /**
         * Authenticate the user using the username and password
         * @param payload username and password
         * @returns true if the authentication was successful, false otherwise
         */
        async basicAuth(payload: { username: string, password: string }): Promise<boolean> {
            logDebug('basicAuth', 'logging in')
            const {username, password} = payload
            return sendToAPI<string>(API_ROUTE.POST_AUTH, {
                headers: [
                    {
                        key: 'Authorization',
                        value: 'Basic ' + btoa(username + ':' + password)
                    }
                ],
                errorMessage: 'Could not log in'
            }).then((apiResponse: APIResponse<string>) => {
                this.user.authenticated = !apiResponse.error
                // return true if the authentication was successful, false otherwise

                return !apiResponse.error
            })
        }
    }
})

interface RecipeState {
    loading: { [key: string]: boolean }
    recipes: { [id: string]: MutableRecipe }
    items: { [id: string]: MutableItem }
}

// Create the store
// called by main.ts
export const useRecipeStore = defineStore('recipes-editor', {
    state: (): RecipeState => ({
        loading: {
            initial: true,
        },
        recipes: {},
        items: {}
    }),
    getters: {
        isLoading: (state): boolean => Object.values(state.loading).some((isLoading: boolean) => isLoading),
        isLoadingInitial: (state): boolean => state.loading.initial,
        /**
         * Get the recipes as list
         * @param state
         */
        getRecipesAsList: (state): MutableRecipe[] => {
            const recipesAsList: MutableRecipe[] = Object.values(state.recipes ?? {})
            if (recipesAsList.length === 0) {
                return []
            }
            return recipesAsList
        },
        /**
         * Get the recipes mapped by their id
         * @param state
         */
        getRecipesAsMap: (state): { [id: string]: MutableRecipe } => state.recipes ?? {},
        getRecipesByItemIds(): { [key: string]: string[] } {
            const recipes = this.getRecipesAsList
            const recipesByItemId: { [key: string]: string[] } = {}

            for (const recipe of recipes) {
                const items = recipe.getStepItems()
                for (const item of items) {
                    if (!(item.getId() in recipesByItemId)) {
                        recipesByItemId[item.getId()] = []
                    }
                    recipesByItemId[item.getId()].push(recipe.getId())
                }
            }
            logDebug('getRecipesByItemIds', recipesByItemId)

            return recipesByItemId
        },
        getItemsAsList: (state): MutableItem[] => {
            return Object.values(state.items ?? {}) ?? []
        },
        getItemNamesAsList(): string[] {
            return (this.getItemsAsList ?? []).map((item: MutableItem) => item.getName())
        },
        getItemsSortedByName(): MutableItem[] {
            return (this.getItemsAsList ?? [])
                .toSorted((a: MutableItem, b: MutableItem) => a.getName().localeCompare(b.getName()))
        },
        getItemsAsMap: (state): { [id: string]: MutableItem } => state.items ?? {},
        getTags(): string[] {
            return [...new Set(this.getRecipesAsList.reduce((tags: string[], recipe: MutableRecipe) => {
                return [...tags, ...(recipe.props.tags ?? [])]
            }, []))]
        }
    },
    actions: {
        async deleteItems(items: MutableItem[] | MutableItem) {
            // if the recipes is not defined, save all recipes
            if (typeof items === 'undefined') {
                items = Object.values(this.getItemsAsMap)
            }

            // if the recipes is not an array, make it an array
            if (!Array.isArray(items)) {
                items = [items]
            }

            const itemIds = items.map((item: MutableItem) => item.getId())
            itemIds.forEach((recipeId: string) => {
                delete this.recipes[recipeId]
            })
            logDebug('deleteItems', itemIds)
            this.setLoadingState('deleteItems')
            return sendToAPI<string>(API_ROUTE.DELETE_ITEMS, {
                errorMessage: 'Could not delete items from database. Please retry later!',
                body: itemIds
            }).then((apiResponse: APIResponse<string>) => {
                this.finishLoading('deleteItems')
                return presentToast(apiResponse.response)
            })
        },
        async deleteRecipes(recipes: MutableRecipe[] | MutableRecipe) {
            // if the recipes is not defined, save all recipes
            if (typeof recipes === 'undefined') {
                recipes = Object.values(this.getRecipesAsMap)
            }

            // if the recipes is not an array, make it an array
            if (!Array.isArray(recipes)) {
                recipes = [recipes]
            }

            const recipeIds = recipes.map((recipe: MutableRecipe) => recipe.getId())
            recipeIds.forEach((recipeId: string) => {
                delete this.recipes[recipeId]
            })
            logDebug('deleteRecipes', recipeIds)
            this.setLoadingState('deleteRecipes')
            return sendToAPI<string>(API_ROUTE.DELETE_RECIPES, {
                errorMessage: 'Could not delete recipes from database. Please retry later!',
                body: recipeIds
            }).then((apiResponse: APIResponse<string>) => {
                this.finishLoading('deleteRecipes')
                return presentToast(apiResponse.response)
            })
        },
        async fetchItems(): Promise<MutableItem[]> {
            logDebug('fetchItems', 'fetching items')
            this.setLoadingState('fetchItems')
            return sendToAPI<MutableItem[]>(API_ROUTE.GET_ITEMS, {errorMessage: 'Could not fetch items'})
                .then((apiResponse: APIResponse<MutableItem[]>) => {
                    // map the items JSON to MutableItem objects
                    // this is because the JSON is not a valid MutableItem object,
                    // and we need to use the MutableItem class methods
                    if (!apiResponse.error) {
                        const items: MutableItem[] = apiResponse.response.map((item: MutableItem) => new MutableItem(itemFromJSON(item)))
                        this.setItems(items)
                    }
                    this.finishLoading('fetchItems')
                    return apiResponse.response
                });
        },
        /**
         * Fetch the recipes from the API and store them in the store
         */
        async fetchRecipes(): Promise<MutableRecipe[]> {
            logDebug('fetchRecipes', 'fetching recipes')
            this.setLoadingState('fetchRecipes')
            return sendToAPI<MutableRecipe[]>(API_ROUTE.GET_RECIPES, {errorMessage: 'Could not fetch recipes'})
                .then(async (apiResponse: APIResponse<MutableRecipe[]>) => {
                    // map the recipes JSON to MutableRecipe objects
                    // this is because the JSON is not a valid MutableRecipe object,
                    // and we need to use the MutableRecipe class methods
                    if (!apiResponse.error) {
                        return await Promise.all(apiResponse.response.map((recipe: MutableRecipe) => recipeFromJSON(recipe)))
                            .then((recipes: Recipe[]) => this.replaceRecipes(recipes.map((recipe: Recipe) => new MutableRecipe(recipe))))
                    }
                    return apiResponse.response
                }).then((recipes: MutableRecipe[]) => {
                    this.finishLoading('fetchRecipes')
                    return recipes
                })
        },
        /**
         * Finish the loading state
         * @param key
         */
        finishLoading(key: string) {
            this.loading[key] = false
        },
        /**
         * Get the recipes by the item id
         * @param itemId
         */
        getRecipesAsListByItemId(itemId?: string): string[] {
            return this.getRecipesByItemIds[itemId ?? ''] ?? []
        },
        /**
         * Prepare the Ionic Storage by fetching the items and recipes
         */
        async prepare() {
            console.log('prepare', this.isLoadingInitial)
            if (!this.isLoadingInitial) {
                return Promise.resolve()
            }
            return this.fetchItems().then(() => this.fetchRecipes()).then(() => {
                this.finishLoading('initial')
            })
        },
        /**
         * Remove a single item
         * @param item
         */
        removeItem(item: MutableItem) {
            delete this.items[item.getId()]
        },
        /**
         * Override all items
         * @param items
         */
        replaceItems(items: MutableItem[]) {
            this.items = Object.assign({}, ...items.map((item: MutableItem) => ({[item.getId()]: item})))
            return items
        },
        /**
         * Override all recipes
         * @param recipes
         */
        replaceRecipes(recipes: MutableRecipe[]) {
            this.recipes = Object.assign({}, ...recipes.map((recipe: MutableRecipe) => ({[recipe.getId()]: recipe})))
            return recipes
        },
        async saveItems(items?: MutableItem[] | MutableItem) {
            // if the recipes is not defined, save all recipes
            if (typeof items === 'undefined') {
                items = Object.values(this.getItemsAsMap)
            }

            // if the recipes is not an array, make it an array
            if (!Array.isArray(items)) {
                items = [items]
            }

            logDebug('saveItem', items)
            this.setLoadingState('saveItem')
            return sendToAPI<string>(API_ROUTE.ADD_ITEMS, {
                body: items,
                errorMessage: 'Could not save items in database. Please retry later!'
            })
                .then((apiResponse: APIResponse<string>) => {
                    this.finishLoading('saveItem')
                    return apiResponse
                })
                .then((apiResponse: APIResponse<string>) => {
                    if (!apiResponse.error) {
                        return this.fetchItems()
                    }
                    return []
                })
                .catch(() => this.setItems(items))
        },
        async saveRecipes(recipes?: MutableRecipe[] | MutableRecipe) {
            // if the recipes is not defined, save all recipes
            if (typeof recipes === 'undefined') {
                recipes = Object.values(this.getRecipesAsMap)
            }

            // if the recipes is not an array, make it an array
            if (!Array.isArray(recipes)) {
                recipes = [recipes]
            }

            logDebug('saveRecipe', recipes)
            this.setLoadingState('saveRecipe')
            return sendToAPI<string>(API_ROUTE.ADD_RECIPES, {
                body: recipes,
                errorMessage: 'Could not save recipe in database. Please retry later!',
                successMessage: 'Updated recipe'
            })
                .then((apiResponse: APIResponse<string>) => {
                    this.finishLoading('saveRecipe')
                    return apiResponse
                })
                .then((apiResponse: APIResponse<string>) => {
                    if (!apiResponse.error) {
                        return this.fetchItems().then(() => this.fetchRecipes())
                    }
                    return []
                })
                .catch(() => this.setRecipes(recipes))
        },
        /**
         * Update a single item
         * @param item
         */
        setItem(item: MutableItem) {
            this.items[item.getId()] = item
        },
        /**
         * Override all items
         * @param items
         */
        setItems(items?: MutableItem[] | MutableItem) {
            if (typeof items === 'undefined') {
                this.items = {}
                return new Promise<MutableItem[]>(() => [])
            }

            if (!Array.isArray(items)) {
                this.items[items.getId()] = items
            } else {
                this.items = Object.assign(this.items, ...items.map((item: MutableItem) => ({[item.getId()]: item})))
            }
        },
        /**
         * Set the loading state
         * @param key
         */
        setLoadingState(key: string) {
            this.loading[key] = true
        },
        /**
         * Update multiple recipes
         * @param recipes
         */
        setRecipes(recipes?: MutableRecipe[] | MutableRecipe) {
            if (typeof recipes === 'undefined') {
                this.recipes = {}
                return Promise.resolve([])
            }

            if (!Array.isArray(recipes)) {
                this.recipes[recipes.getId()] = recipes
            } else {
                this.recipes = Object.assign(this.recipes, ...recipes.map((recipe: MutableRecipe) => ({[recipe.getId()]: recipe})))
            }
        }
    },
})
