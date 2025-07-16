#!/bin/bash

echo "Setting up database for Student Rating System..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "Creating .env file from .env.example..."
    cp .env.example .env
    echo "Please edit .env file with your configuration before continuing."
    exit 1
fi

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

# Run database migrations
echo "Running database migrations..."
npx prisma migrate dev --name "initial_setup"

# Check if migration was successful
if [ $? -eq 0 ]; then
    echo "✅ Database setup completed successfully!"
    echo ""
    echo "Next steps:"
    echo "1. Update your .env file with the correct database credentials"
    echo "2. Update Canvas API configuration in .env"
    echo "3. Run 'bun run src/index.ts' to start the server"
    echo "4. (Optional) Run 'npx prisma studio' to explore the database"
else
    echo "❌ Database setup failed. Please check your configuration."
    exit 1
fi
