// server.js
require('dotenv').config();
const express = require('express');
const neo4j = require('neo4j-driver');
const cors = require('cors');
const path = require('path');

const app = express();
const port = 3000;

// --- Driver Management for Multiple Databases ---
const drivers = {};

function getDriver(type) {
    const graphType = type.toUpperCase();
    if (drivers[graphType]) {
        return drivers[graphType];
    }

    const uri = process.env[`NEO4J_URI_${graphType}`];
    const user = process.env[`NEO4J_USER_${graphType}`] || process.env.NEO4J_USER;
    const password = process.env[`NEO4J_PASSWORD_${graphType}`] || process.env.NEO4J_PASSWORD;

    if (!uri || !user || !password) {
        throw new Error(`Database credentials for graph type "${type}" not found in .env file. Please define NEO4J_URI_${graphType}.`);
    }

    console.log(`Creating new driver for ${graphType} at ${uri}`);
    const driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
        disableLosslessIntegers: true,
        trust: 'TRUST_ALL_CERTIFICATES' // Use for local development with self-signed certificates
    });

    drivers[graphType] = driver;
    return driver;
}

// Middleware
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from the 'public' directory

const getGraphData = async (session, cypherQueryNodes = 'MATCH (n) RETURN n', cypherQueryLinks = 'MATCH ()-[r]->() RETURN r') => {
    try {
        const nodesResult = await session.run(cypherQueryNodes);
        const nodes = new Map();
        nodesResult.records.forEach(record => {
            const node = record.get('n');
            nodes.set(node.elementId, {
                id: node.elementId,
                label: node.labels[0] || 'Node',
                properties: node.properties,
            });
        });

        const linksResult = await session.run(cypherQueryLinks);
        const links = linksResult.records.map(record => {
            const relationship = record.get('r');
            return {
                source: relationship.startNodeElementId,
                target: relationship.endNodeElementId,
                type: relationship.type,
                properties: relationship.properties,
            };
        });

        return {
            nodes: Array.from(nodes.values()),
            links: links
        };
    } catch (error) {
        console.error('Error fetching graph data:', error);
        throw error;
    }
};

// API Endpoints for different graphs
app.get('/api/graph/:type', async (req, res) => {
    const { type } = req.params;
    let session;
    try {
        const driver = getDriver(type);
        session = driver.session({ database: 'neo4j' });
        const graphData = await getGraphData(session);
        res.json(graphData);
    } catch (error) {
        console.error(`Error processing request for graph "${type}":`, error.message);
        res.status(500).send(`Error fetching graph data for "${type}". Check server logs.`);
    } finally {
        if (session) {
            await session.close();
        }
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log('Serving D3 visualization from the "public" directory.');
    console.log(`Graph data available via endpoints like /api/graph/application`);
});

// Graceful shutdown
process.on('exit', async () => {
    console.log('Closing all database drivers...');
    for (const type in drivers) {
        if (drivers[type]) {
            await drivers[type].close();
        }
    }
    console.log('All drivers closed.');
});
