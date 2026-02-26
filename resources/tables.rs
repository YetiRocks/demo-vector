use yeti_core::prelude::*;

// Article: public read + create (vector search demo)
// Users can generate new articles to explore semantic search.
resource!(TableExtender for Article {
    get => allow_read(),
    post => allow_create(),
});
