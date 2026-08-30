migrate(
  (app) => {
    const messagesCol = app.findCollectionByNameOrId('messages')
    if (messagesCol) {
      // Add 'file' field for conversation file attachments (maxSelect: 1, maxSize: 50MB)
      if (!messagesCol.fields.getByName('file')) {
        messagesCol.fields.add(
          new FileField({
            name: 'file',
            maxSelect: 1,
            maxSize: 52428800,
            required: false,
          }),
        )
      }
      // Add 'file_name' text field for storing original filename
      if (!messagesCol.fields.getByName('file_name')) {
        messagesCol.fields.add(
          new TextField({
            name: 'file_name',
            required: false,
          }),
        )
      }
      // Add 'file_size' number field for storing file size in bytes
      if (!messagesCol.fields.getByName('file_size')) {
        messagesCol.fields.add(
          new NumberField({
            name: 'file_size',
            required: false,
            onlyInt: true,
          }),
        )
      }
      // Add 'file_type' text field for mime/extension classification
      if (!messagesCol.fields.getByName('file_type')) {
        messagesCol.fields.add(
          new TextField({
            name: 'file_type',
            required: false,
          }),
        )
      }
      app.save(messagesCol)
    }
  },
  (app) => {
    const messagesCol = app.findCollectionByNameOrId('messages')
    if (messagesCol) {
      if (messagesCol.fields.getByName('file')) {
        messagesCol.fields.removeByName('file')
      }
      if (messagesCol.fields.getByName('file_name')) {
        messagesCol.fields.removeByName('file_name')
      }
      if (messagesCol.fields.getByName('file_size')) {
        messagesCol.fields.removeByName('file_size')
      }
      if (messagesCol.fields.getByName('file_type')) {
        messagesCol.fields.removeByName('file_type')
      }
      app.save(messagesCol)
    }
  },
)
