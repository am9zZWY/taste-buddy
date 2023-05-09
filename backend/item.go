// Package src
/*
Copyright © 2023 JOSEF MUELLER
*/
package main

import (
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

// HandleGetAllItems gets called by router
// Calls getRecipesFromDB and handles the context
func (server *TasteBuddyServer) HandleGetAllItems(context *gin.Context) {
	items, err := server.GetAllItems()
	if err != nil {
		server.LogError("HandleGetAllItems", err)
		ServerError(context, true)
		return
	}
	Success(context, items)
}

// HandleGetItemById gets called by router
// Calls getItemByIdFromDB and handles the context
func (server *TasteBuddyServer) HandleGetItemById(context *gin.Context) {
	id := context.Param("id")

	// convert id to primitive.ObjectID
	objectID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		server.LogError("HandleGetItemById", err)
		ServerError(context, true)
		return
	}

	item, err := server.GetItemById(objectID)
	if err != nil {
		server.LogError("HandleGetItemById", err)
		ServerError(context, true)
		return
	}

	Success(context, item)
}

// HandleAddItem gets called by router
// Calls addItemToDB and handles the context
func (server *TasteBuddyServer) HandleAddItem(context *gin.Context) {
	server.LogContextHandle(context, "HandleAddItem", "Trying to add/update item")

	var newItem Item
	if err := context.BindJSON(&newItem); err != nil {
		server.LogError("HandleAddItem", err)
		BadRequestError(context, "Invalid item")
		return
	}

	var itemId primitive.ObjectID
	var err error
	if itemId, err = server.AddOrUpdateItem(newItem); err != nil {
		server.LogError("HandleAddItem", err)
		ServerError(context, true)
		return
	}
	server.LogContextHandle(context, "HandleAddItem", "Added/Updated item "+newItem.Name+" ("+newItem.ID.Hex()+")")
	Success(context, "Saved item "+itemId.Hex())
}

// HandleDeleteItemById gets called by router
// Calls DeleteItemById and handles the context
func (server *TasteBuddyServer) HandleDeleteItemById(context *gin.Context) {
	id := context.Param("id")
	server.LogContextHandle(context, "HandleDeleteItemById", "Trying to delete item "+id)

	// convert id to primitive.ObjectID
	objectID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		server.LogError("HandleDeleteItemById", err)
		ServerError(context, true)
		return
	}

	// delete recipe
	if _, err := server.DeleteItemById(objectID); err != nil {
		server.LogError("HandleDeleteItemById", err)
		ServerError(context, true)
		return
	}
	server.LogContextHandle(context, "HandleDeleteItemById", "Deleted item "+id)
	Success(context, "Deleted item "+id)
}

// GetItemsCollection gets recipes from database
func (app *TasteBuddyApp) GetItemsCollection() *mongo.Collection {
	return app.client.Database("tastebuddy").Collection("items")
}

// GetAllItems gets all items from database
func (app *TasteBuddyApp) GetAllItems() ([]Item, error) {
	ctx := DefaultContext()

	// get all items from database that are not deleted
	cursor, err := app.GetItemsCollection().Find(ctx, bson.M{"deleted": bson.M{"$ne": true}})
	if err != nil {
		return []Item{}, app.LogError("GetAllItems", err)
	}
	var itemsFromDatabase []Item
	if err = cursor.All(ctx, &itemsFromDatabase); err != nil {
		return []Item{}, app.LogError("GetAllItems", err)
	}

	if itemsFromDatabase == nil {
		// return void array if nil
		itemsFromDatabase = []Item{}
	}
	return itemsFromDatabase, nil
}

// GetItemById gets item from database by id
func (app *TasteBuddyApp) GetItemById(id primitive.ObjectID) (Item, error) {
	ctx := DefaultContext()

	items := app.GetItemsCollection().FindOne(ctx, bson.M{"_id": id})

	if items.Err() != nil {
		return Item{}, app.LogError("GetItemById", items.Err())
	}

	var itemFromDatabase Item
	if err := items.Decode(&itemFromDatabase); err != nil {
		return Item{}, app.LogError("GetAllItems", err)
	}

	return itemFromDatabase, nil
}

func (app *TasteBuddyApp) DeleteItemById(id primitive.ObjectID) (primitive.ObjectID, error) {
	ctx := DefaultContext()
	var err error

	// delete recipe by setting deleted to true
	app.LogWarning("DeleteItemById", "Delete item "+id.Hex()+" from database")
	if _, err = app.GetItemsCollection().UpdateByID(ctx, id, bson.D{{Key: "$set", Value: bson.D{{Key: "deleted", Value: true}}}}); err != nil {
		return id, app.LogError("DeleteItemById + "+id.Hex(), err)
	}

	return id, nil
}

// AddOrUpdateItems adds or updates multiple items in the database of items
func (app *TasteBuddyApp) AddOrUpdateItems(newItems []Item) error {
	for _, item := range newItems {
		if _, err := app.AddOrUpdateItem(item); err != nil {
			return app.LogError("AddOrUpdateItems", err)
		}
	}
	return nil
}

// AddOrUpdateItem adds or updates an item in the database of items
func (app *TasteBuddyApp) AddOrUpdateItem(newItem Item) (primitive.ObjectID, error) {
	ctx := DefaultContext()
	var err error
	var objectId primitive.ObjectID

	if newItem.ID.IsZero() {
		// add item
		var result *mongo.InsertOneResult
		app.LogWarning("AddOrUpdateItem + "+newItem.Name, "Add new item to database")
		result, err = app.GetItemsCollection().InsertOne(ctx, newItem)
		objectId = result.InsertedID.(primitive.ObjectID)
	} else {
		// update item
		app.LogWarning("AddOrUpdateItem + "+newItem.Name+"("+newItem.ID.Hex()+")", "Update existing item in database")
		_, err = app.GetItemsCollection().UpdateOne(ctx,
			bson.D{{Key: "_id", Value: newItem.ID}},
			bson.D{{Key: "$set", Value: newItem}})
		objectId = newItem.ID
	}
	if err != nil {
		return objectId, app.LogError("AddOrUpdateItem + "+newItem.Name, err)
	}
	app.LogWarning("AddOrUpdateItem + "+newItem.Name+"("+objectId.Hex()+")", "Successful operation")
	return objectId, nil
}

// ExtractItems gets all items used in a recipe
func (recipe *Recipe) ExtractItems() []Item {
	var items []Item

	for _, step := range recipe.Steps {
		for _, stepItem := range step.Items {
			items = append(items, stepItem.Item)
		}
	}
	return items
}

// GetItemQuality gets the quality of an item
// 0 = empty (low quality)
// 1 = ID (medium quality)
// 2 = name (medium quality)
// 3 = name + type (medium quality)
// 4 = name + type + imgUrl (high quality)
func (item *Item) GetItemQuality() int {
	var itemQuality = 0
	var conditions = [4]bool{!item.ID.IsZero(), item.ImgUrl != "", item.Name != "", item.Type != ""}
	for _, condition := range conditions {
		if condition {
			itemQuality = itemQuality + 1
		}
	}

	return itemQuality
}