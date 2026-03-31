# Project Name

## Overview
[Brief description]

## Prerequisites
- Node.js 20+
- Python 3.14+
- Git

## Installation

### Frontend
\`\`\`bash
npm install
\`\`\`

### Backend
\`\`\`bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
\`\`\`

## Running the App
1. Open two terminals pointing to the root of this project
2. In the first one, run "npm run dev"
3. In the second run "uvicorn main:app --reload --port 8000"
4. Host a database and get it's credentials
5. Create a file named ".env.local" in the root directory by making a clone of ".env.example" and renaming it
6. Fill in the secrets to point to your databse by editing the approprate credentials
7. Under backend/ create a copy of that ".env.local" file and rename it to be ".env"
8. Add your API keys here as well where relevant. You'll need an Anthropic API Key

This should create a locally running version of the app

## Testing
[Instructions]

## Contributing
See CONTRIBUTING.md