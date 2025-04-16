CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password TEXT NOT NULL
);

CREATE TABLE results (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    section INTEGER NOT NULL,
    score INTEGER NOT NULL,
    total INTEGER NOT NULL,
    timestamp TIMESTAMP NOT NULL
);