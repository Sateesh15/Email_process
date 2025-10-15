# HR Resume Processing Backend

A comprehensive Node.js backend system for processing HR resumes with advanced parsing capabilities.

## Features

- 📄 **Multi-format Support**: PDF, DOCX, and EML files
- 🔍 **Smart Parsing**: Extract candidate information automatically
- 📊 **Excel Export**: Generate consolidated reports
- 📋 **PDF Generation**: Individual candidate summaries  
- 📧 **EML Processing**: Handle email attachments recursively
- 🎛️ **Flexible Extraction**: Optional additional fields extraction
- 🚀 **RESTful API**: Clean, documented endpoints
- 📝 **Comprehensive Logging**: Winston-based logging system
- ✅ **Input Validation**: Joi-based request validation
- 🔒 **Error Handling**: Robust error management

## Installation

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd hr-resume-backend
```

2. Install dependencies:
```bash
npm install
```

3. Create environment variables (optional):
```bash
cp .env.example .env
```

4. Start the development server:
```bash
npm run dev
```

5. For production:
```bash
npm start
```

## API Endpoints

### File Upload
- `POST /api/upload` - Upload resume files
- `POST /api/eml/process` - Process EML files

### Data Management  
- `GET /api/candidates` - Get all processed candidates
- `DELETE /api/candidates/clear` - Clear all candidate data

### Downloads
- `GET /api/downloads/excel` - Download consolidated Excel report
- `GET /api/downloads/pdf/:candidateId` - Download individual PDF summary

### Utility
- `GET /api/health` - Health check endpoint

## Usage Examples

### Upload Files
```javascript
const formData = new FormData();
formData.append('files', file1);
formData.append('files', file2);
formData.append('extractAdditionalFields', 'true');

fetch('/api/upload', {
  method: 'POST',
  body: formData
})
.then(response => response.json())
.then(data => console.log(data));
```

### Get Candidates
```javascript
fetch('/api/candidates')
  .then(response => response.json())
  .then(candidates => console.log(candidates));
```

## Project Structure

```
hr-resume-backend/
├── index.js                 # Main application file
├── package.json             # Dependencies and scripts
├── README.md               # This file
├── routes/                 # API route handlers
│   ├── fileUpload.js       # File upload routes
│   ├── candidates.js       # Candidate data routes
│   ├── downloads.js        # Download routes
│   └── eml.js             # EML processing routes
├── services/              # Business logic services
│   ├── resumeParser.js    # Resume parsing logic
│   ├── excelGenerator.js  # Excel generation
│   ├── pdfGenerator.js    # PDF generation
│   └── emlProcessor.js    # EML file processing
├── utils/                 # Utility functions
│   ├── fileValidation.js  # File validation helpers
│   ├── textExtractor.js   # Text extraction utilities
│   └── logger.js          # Logging configuration
├── middleware/            # Custom middleware
│   └── validation.js      # Request validation middleware
├── uploads/              # Uploaded files storage
├── outputs/              # Generated output files
├── logs/                 # Application logs
└── temp/                 # Temporary processing files
```

## Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
PORT=3000
NODE_ENV=development
MAX_FILE_SIZE=10485760  # 10MB in bytes
MAX_FILES_COUNT=20
UPLOAD_DIR=uploads
OUTPUT_DIR=outputs
LOG_LEVEL=info
```

### File Size Limits

- Maximum file size: 10MB per file
- Maximum files per upload: 20 files
- Supported formats: PDF, DOCX, EML

## Dependencies

### Core Dependencies
- `express` - Web framework
- `multer` - File upload handling
- `pdf-parse` - PDF text extraction
- `docx` - DOCX file processing
- `textract` - Multi-format text extraction
- `mailparser` - EML file parsing
- `exceljs` - Excel file generation
- `pdfkit` - PDF generation
- `cors` - Cross-origin resource sharing
- `winston` - Logging framework
- `joi` - Input validation
- `uuid` - Unique ID generation
- `fs-extra` - Enhanced file system operations

### Development Dependencies
- `nodemon` - Development server with auto-reload
- `jest` - Testing framework
- `supertest` - HTTP testing

## Testing

Run the test suite:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

## Error Handling

The application includes comprehensive error handling:

- File validation errors
- Parsing errors
- Network errors
- Database errors (if applicable)
- Memory limitations

All errors are logged using Winston and returned as structured JSON responses.

## Logging

Logs are written to:
- `logs/combined.log` - All logs
- `logs/error.log` - Error logs only
- Console output during development

## Performance Considerations

- Files are processed asynchronously
- Memory usage is optimized for large files
- Temporary files are cleaned up automatically
- Concurrent upload handling

## Security Features

- File type validation
- File size limitations
- Input sanitization
- Error message sanitization
- CORS configuration

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For support, please open an issue in the repository or contact the development team.

## Changelog

### v1.0.0
- Initial release
- Basic resume parsing functionality
- Excel and PDF generation
- EML file support
- RESTful API implementation
