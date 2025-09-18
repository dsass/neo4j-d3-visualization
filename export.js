// export.js
require('dotenv').config();
const express = require('express');
const neo4j = require('neo4j-driver');
const fs = require('fs');
const path = require('path');

// --- Driver Management for Multiple Databases (copied from server.js) ---
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
        trust: 'TRUST_ALL_CERTIFICATES'
    });

    drivers[graphType] = driver;
    return driver;
}

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

// --- Main Export Logic ---
(async () => {
    const graphType = process.argv[2];
    if (!graphType) {
        console.error('Error: Please provide a graph type to export (e.g., "solution", "application").');
        console.error('Usage: node export.js <graph_type>');
        process.exit(1);
    }

    const driver = getDriver(graphType);
    const session = driver.session({ database: 'neo4j' });

    try {
        console.log(`Fetching data for "${graphType}" graph...`);
        const graphData = await getGraphData(session);
        const filePath = path.join(__dirname, 'public', `${graphType}.json`);
        fs.writeFileSync(filePath, JSON.stringify(graphData, null, 2));
        console.log(`✅ Successfully exported graph "${graphType}" to ${filePath}`);
    } catch (error) {
        console.error(`❌ Failed to export graph:`, error.message);
    } finally {
        await session.close();
        await driver.close();
    }
})();