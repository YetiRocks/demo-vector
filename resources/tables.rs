use yeti_core::prelude::*;

// Article: full public CRUD (vector search demo)
// Users can create, read, and delete articles to explore semantic search.
resource!(TableExtender for Article {
    get => allow_read(),
    post => allow_create(),
    delete => allow_delete(),
});
