// public/local-app.js
document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('graph-container');
    const width = container.clientWidth;
    const height = container.clientHeight;
    const panelWidth = 220; // Width of the info panel
    const graphWidth = width - panelWidth; // Adjust graph width for the panel
    const nodeWidth = 100; // Width of the rectangle node
    const nodeHeight = 50; // Height of the rectangle node
    const bottomPadding = 60; // Space at the bottom for the search bar
    
    // --- Determine which graph to load from URL parameter ---
    const urlParams = new URLSearchParams(window.location.search);
    const file = urlParams.get('file') || 'application'; // Default to 'application'

    // Update page titles to reflect the current graph
    document.title = `${file.charAt(0).toUpperCase() + file.slice(1)} Graph (Local)`;
    document.getElementById('graph-title').textContent = `${file.charAt(0).toUpperCase() + file.slice(1)} Knowledge Graph (Local)`;

    // Fetch data from a local JSON file
    const response = await fetch(`${file}.json`);

    if (!response.ok) {
        console.error("Failed to fetch graph data:", response.status, response.statusText);
        container.innerHTML = `<p style="color: red; text-align: center;">Error: Could not load graph data from <strong>${file}.json</strong>. Please make sure the file exists in the /public directory.</p>`;
        return; // Stop execution
    }

    let graph = await response.json();

    let originalGraph = JSON.parse(JSON.stringify(graph)); // Deep copy for safekeeping
    let collapsedTypes = new Set(); // Keep track of which types to collapse
    let focusedNode = null;
    let focusedLink = null;
    // Create a color scale in the outer scope so it's accessible everywhere
    const baseColor = d3.scaleOrdinal([
        "#081182", "#0022FF", "#6172F3", "#15B79E", "#0E9384", "#669F2A", "#4E5BA6", "#6938EF", "#088AB2", "#9F1AB1", "#4A5578", "#875BF7"
    ]);

    const color = (label) => {
        if (label === 'Enterprise') {
            return '#000000'; // Always return black for Enterprise nodes
        }
        // For all other labels, use the standard color scale
        return baseColor(label);
    };

    // --- Create SVG and persistent elements once ---
    const svg = d3.create("svg")
        .attr("width", graphWidth)
        .attr("height", height)
        .attr("viewBox", [0, 0, graphWidth, height]);

    // Add a main group that will contain all graph elements and be targeted by zoom
    const mainGroup = svg.append("g");

    // --- Zoom and Pan ---
    const zoom = d3.zoom()
        .scaleExtent([0.1, 4]) // Set min and max zoom levels
        .on("zoom", (event) => {
            mainGroup.attr("transform", event.transform);
        });

    // Apply zoom behavior to the SVG.
    svg.call(zoom);

    // --- Zoom Buttons ---
    const zoomControls = d3.select(container).append('div')
        .attr('class', 'zoom-controls');

    zoomControls.append('button')
        .attr('id', 'zoom-in')
        .text('+')
        .on('click', () => {
            svg.transition().duration(250).call(zoom.scaleBy, 1.2);
        });

    zoomControls.append('button')
        .attr('id', 'zoom-out')
        .text('−') // Using a minus sign character
        .on('click', () => {
            svg.transition().duration(250).call(zoom.scaleBy, 1 / 1.2);
        });
    
    // --- Hierarchy is now the default ---
    let isHierarchyActive = true; // Set to true to make hierarchy the default layout
    
    // --- Info Panel ---
    const infoPanel = d3.select(container).append('div')
        .attr('id', 'info-panel');

    function updateInfoPanel(data, type) {
        infoPanel.html(''); // Clear previous content

        const h3 = infoPanel.append('h3');

        if (type === 'Node') {
            if (data.isSummary) {
                // Special display for Summary Nodes
                h3.append('span')
                    .attr('class', 'color-dot')
                    .style('background-color', color(data.originalLabel));
                h3.node().append(document.createTextNode(data.originalLabel)); // Use original label (e.g., "Goal")

                infoPanel.append('p').attr('class', 'summary-count').text(`${data.count} nodes`);

                if (data.properties && data.properties.containedNodes) {
                    const list = infoPanel.append('ul').attr('class', 'contained-nodes-list');
                    data.properties.containedNodes.forEach(node => {
                         const listItem = list.append('li')
                            .text(node.name)
                            .on('click', () => {
                                // Check the collapsed state at the moment of the click
                                const isSolutionHierarchical = Object.keys(collapsedTypes).some(key => key.startsWith('4:'));
                                const isCollapsed = isSolutionHierarchical 
                                    ? collapsedTypes[data.solutionId]?.has(data.originalLabel) 
                                    : collapsedTypes.has(data.originalLabel);

                                if (isCollapsed) {
                                    // If the group is collapsed, expand and focus
                                    expandAndFocus(node.id, data.originalLabel, data.solutionId);
                                } else {
                                    // If the group is already expanded, just focus on the node
                                    const targetNode = graph.nodes.find(n => n.id === node.id);
                                    if (targetNode) {
                                        handleClick({ stopPropagation: () => {} }, targetNode);
                                    }
                                }
                            })
                            .on('mouseover', () => {
                                const isSolutionHierarchical = Object.keys(collapsedTypes).some(key => key.startsWith('4:'));
                                const isCollapsed = isSolutionHierarchical 
                                    ? collapsedTypes[data.solutionId]?.has(data.originalLabel) 
                                    : collapsedTypes.has(data.originalLabel);

                                if (!isCollapsed) {
                                    // Highlight the node on the graph if the group is expanded
                                    nodeGroup.filter(d => d.id === node.id).select('.node').classed('hovered', true);
                                }
                            })
                            .on('mouseout', () => {
                                const isSolutionHierarchical = Object.keys(collapsedTypes).some(key => key.startsWith('4:'));
                                const isCollapsed = isSolutionHierarchical 
                                    ? collapsedTypes[data.solutionId]?.has(data.originalLabel) 
                                    : collapsedTypes.has(data.originalLabel);

                                if (!isCollapsed) {
                                    // Remove the highlight
                                    nodeGroup.filter(d => d.id === node.id).select('.node').classed('hovered', false);
                                }
                            });
                    });
                }
            } else {
                // Default display for regular nodes
                h3.append('span')
                    .attr('class', 'color-dot')
                    .style('background-color', color(data.label));
                h3.node().append(document.createTextNode(data.label));

                if (data.label === 'Enterprise') {
                    h3.append('img')
                        .attr('src', 'assets/root-black.png')
                        .attr('class', 'info-panel-icon')
                        .attr('title', 'Root node');
                }

                const properties = data.properties || {};
                renderProperties(infoPanel, properties);

                const relationships = getRelationships(data);
                if (relationships.length > 0) {
                    const relsContainer = infoPanel.append('div').attr('class', 'relationships-container');
                    relsContainer.append('h4').text('Relationships');
                    const relsList = relsContainer.append('ul').attr('class', 'relationship-list');
                    relationships.forEach(rel => {
                        renderRelationship(relsList, rel, data);
                    });
                }
            }
        } else {
            // For links, just show the type
            h3.text('Relationship');

            const typeContainer = infoPanel.append('div').attr('class', 'property');
            typeContainer.append('span').attr('class', 'property-key').text('Type');
            typeContainer.append('div').attr('class', 'property-value-container').append('span').attr('class', 'property-value').text(data.type);

            const nodesContainer = infoPanel.append('div').attr('class', 'relationships-container');
            nodesContainer.append('h4').text('Connects');
            const nodesList = nodesContainer.append('ul').attr('class', 'relationship-list');
            
            const sourceLi = nodesList.append('li');
            sourceLi.html(`<div><strong>From:</strong> ${getNodeName(data.source)} <em>(${data.source.label})</em></div>`);

            const targetLi = nodesList.append('li');
            targetLi.html(`<div><strong>To:</strong> ${getNodeName(data.target)} <em>(${data.target.label})</em></div>`);

            const properties = data.properties || {};
            renderProperties(infoPanel, properties);
        }
    }

    function renderProperties(container, properties) {
        if (Object.keys(properties).length === 0) {
            container.append('p').text('No properties to display.');
            return;
        }

        for (const [key, value] of Object.entries(properties)) {
            const propDiv = container.append('div').attr('class', 'property');
            propDiv.append('span').attr('class', 'property-key').text(key);
            const valueContainer = propDiv.append('div').attr('class', 'property-value-container');

            if (typeof value === 'string') {
                const trimmedValue = value.trim();
                // Try to parse as a list
                if (trimmedValue.startsWith('[') && trimmedValue.endsWith(']')) {
                    try {
                        // Replace single quotes for valid JSON
                        const array = JSON.parse(trimmedValue.replace(/'/g, '"'));
                        const list = valueContainer.append('ul').attr('class', 'property-list');
                        array.forEach(item => list.append('li').text(item));
                        continue;
                    } catch (e) { /* Fallback to text */ }
                }
                // Try to parse as a JSON object
                if (trimmedValue.startsWith('{') && trimmedValue.endsWith('}')) {
                    try {
                        const obj = JSON.parse(trimmedValue);
                        valueContainer.append('pre').text(JSON.stringify(obj, null, 2));
                        continue;
                    } catch (e) { /* Fallback to text */ }
                }
                // Regular string
                valueContainer.append('span').attr('class', 'property-value').text(value);

            } else if (typeof value === 'object' && value !== null) {
                // Handle Neo4j temporal types
                if (value.year && value.month && value.day) {
                    const date = new Date(value.year, value.month - 1, value.day, value.hour, value.minute, value.second);
                    valueContainer.append('span').attr('class', 'property-value').text(date.toLocaleString());
                } 
                // Handle Neo4j integer types
                else if (value.low !== undefined) {
                    valueContainer.append('span').attr('class', 'property-value').text(value.low);
                } 
                // Handle other objects
                else {
                    valueContainer.append('pre').text(JSON.stringify(value, null, 2));
                }
            } else {
                // Handle numbers, booleans, etc.
                valueContainer.append('span').attr('class', 'property-value').text(value);
            }
        }
    }

    function clearInfoPanel() {
        infoPanel.html(''); // Clear previous content
        infoPanel.append('h3').text('Graph Summary');

        const nodeCount = originalGraph.nodes.length;
        const linkCount = originalGraph.links.length;
        const groupCount = new Set(originalGraph.nodes.map(n => n.label)).size;

        infoPanel.append('div').attr('class', 'property').html(`<span class="property-key">Total Nodes:</span> <span class="property-value">${nodeCount}</span>`);
        infoPanel.append('div').attr('class', 'property').html(`<span class="property-key">Total Relationships:</span> <span class="property-value">${linkCount}</span>`);
        infoPanel.append('div').attr('class', 'property').html(`<span class="property-key">Node Groups:</span> <span class="property-value">${groupCount}</span>`);

    }
    clearInfoPanel(); // Initialize the panel

    function handleMouseOut() {
        if (focusedNode) {
            updateInfoPanel(focusedNode, 'Node');
        } else if (focusedLink) {
            updateInfoPanel(focusedLink, 'Link');
        } else {
            clearInfoPanel();
        }
    }

    function getRelationships(node) {
        const relationships = [];
        (graph.links || []).forEach(link => {
            if (link.source === node || link.target === node) {
                relationships.push(link);
            }
        });
        return relationships;
    }

    function renderRelationship(list, rel, currentNode) {
        const otherNode = rel.source === currentNode ? rel.target : rel.source;
        const direction = rel.source === currentNode ? 'out' : 'in';
        const listItem = list.append('li');
        if (direction === 'out') {
            listItem.html(`<span class="rel-arrow out">→</span> <div><strong>${rel.type}</strong> to ${getNodeName(otherNode)} <em>(${otherNode.label})</em></div>`);
        } else {
            listItem.html(`<span class="rel-arrow in">←</span> <div><strong>${rel.type}</strong> from ${getNodeName(otherNode)} <em>(${otherNode.label})</em></div>`);
        }
    }

    function expandAndFocus(nodeIdToFocus, nodeTypeToExpand, solutionId = null) {
        // Find the checkbox for the type we want to expand
        const checkboxId = solutionId ? `collapse-${solutionId}-${nodeTypeToExpand}` : `collapse-${nodeTypeToExpand}`;
        const checkbox = document.getElementById(checkboxId);

        // Check if the box is UNCHECKED (meaning the type is currently collapsed)
        if (checkbox && !checkbox.checked) {
            // Programmatically check the box to trigger the expansion
            checkbox.checked = true;
            if (solutionId) {
                // Solution-hierarchical mode
                collapsedTypes[solutionId]?.delete(nodeTypeToExpand);
            } else {
                // Global mode
                collapsedTypes.delete(nodeTypeToExpand);
            }

            // Re-transform and re-render the graph, passing the ID of the node to focus on
            const newGraphData = transformGraph();
            renderGraph(newGraphData, nodeIdToFocus);
        }
    }

    function expandSingleGroup(summaryNodeToExpand) {
        const { originalLabel, solutionId } = summaryNodeToExpand;

        // 1. Update the collapsedTypes state
        if (solutionId && collapsedTypes[solutionId]) {
            // Solution-hierarchical mode
            collapsedTypes[solutionId].delete(originalLabel);
        } else {
            // Global mode
            collapsedTypes.delete(originalLabel);
        }
        
        // Uncheck the corresponding checkbox
        const checkboxId = solutionId ? `collapse-${solutionId}-${originalLabel}` : `collapse-${originalLabel}`;
        const checkbox = document.getElementById(checkboxId);
        if (checkbox) {
            checkbox.checked = true;
        }

        // 2. Re-transform the graph data
        const newGraphData = transformGraph();

        // 3. Find the specific nodes that were just expanded
        const expandedNodeIds = new Set(summaryNodeToExpand.properties.containedNodes.map(n => n.id));
        const nodesToFocus = newGraphData.nodes.filter(n => expandedNodeIds.has(n.id));

        // 4. Re-render the graph
        renderGraph(newGraphData);
        
        // Optional: Add a visual effect to the newly expanded nodes
        nodeGroup.filter(d => expandedNodeIds.has(d.id)).selectAll('rect').style('stroke', '#f0ad4e').transition().duration(1500).style('stroke', '#E9E9E9');
    }

    function contractSingleGroup(nodeToCollapse) {
        const { originalLabel, solutionId } = nodeToCollapse.belongsToSummary;

        // 1. Update the collapsedTypes state
        if (solutionId && collapsedTypes[solutionId]) {
            collapsedTypes[solutionId].add(originalLabel);
        } else {
            collapsedTypes.add(originalLabel);
        }

        // Uncheck the corresponding checkbox in the control panel
        const checkboxId = solutionId ? `collapse-${solutionId}-${originalLabel}` : `collapse-${originalLabel}`;
        const checkbox = document.getElementById(checkboxId);
        if (checkbox) {
            checkbox.checked = false;
        }

        // 2. Re-render the graph
        const newGraphData = transformGraph();
        renderGraph(newGraphData);
    }

    // --- Collapse Controls by Type ---
    const collapseContainer = d3.select(container).append('div')
        .attr('class', 'collapse-controls-container');

    // Declare variables in a higher scope to be accessible by filterGraph
    let nodeGroup, link, linkLabel, linkGroup;
    let simulation;

    const solutionNodes = originalGraph.nodes.filter(n => n.label === 'Solution');
    const originalNodeMap = new Map(originalGraph.nodes.map(n => [n.id, n]));

    if (solutionNodes.length > 0) {
        // --- Solution-Based Hierarchy Controls ---
        collapseContainer.append('h4').text('Expand Node Types');
        collapsedTypes = {}; // Use an object for solution-specific state

        solutionNodes.forEach(solutionNode => {
            const solutionContainer = collapseContainer.append('div').attr('class', 'solution-control-group');
            solutionContainer.append('h5').text(getNodeName(solutionNode));

            const neighbors = new Set();
            originalGraph.links.forEach(l => {
                if (l.source === solutionNode.id) neighbors.add(originalNodeMap.get(l.target));
                if (l.target === solutionNode.id) neighbors.add(originalNodeMap.get(l.source));
            });

            const neighborLabelCounts = d3.rollup(Array.from(neighbors), v => v.length, d => d.label);
            collapsedTypes[solutionNode.id] = new Set(Array.from(neighborLabelCounts.keys()).filter(label => neighborLabelCounts.get(label) > 1));

            neighborLabelCounts.forEach((count, label) => {
                if (count <= 1) return;
                const controlDiv = solutionContainer.append('div').attr('class', 'collapse-control');
                controlDiv.append('input')
                    .attr('type', 'checkbox')
                    .attr('id', `collapse-${solutionNode.id}-${label}`)
                    .property('checked', false)
                    .on('change', function() {
                        if (this.checked) {
                            collapsedTypes[solutionNode.id].delete(label);
                        } else {
                            collapsedTypes[solutionNode.id].add(label);
                        }
                        renderGraph(transformGraph());
                    });
                 const labelElement = controlDiv.append('label').attr('for', `collapse-${solutionNode.id}-${label}`).style('color', color(label));
                labelElement.append('span')
                    .attr('class', 'color-dot')
                    .style('border-color', color(label));
                labelElement.node().append(document.createTextNode(` ${label}`));
            });
        });
    } else {
        // --- Global Controls (Fallback) ---
        collapseContainer.append('h4').text('Expand Node Types');
        const labelCounts = d3.rollup(originalGraph.nodes, v => v.length, d => d.label);
        const allLabels = Array.from(labelCounts.keys());
        collapsedTypes = new Set(allLabels.filter(label => label !== 'Solution' && labelCounts.get(label) > 1));

        allLabels.forEach(label => {
            if (label === 'Solution' || labelCounts.get(label) <= 1) return;

            const controlDiv = collapseContainer.append('div').attr('class', 'collapse-control');
            controlDiv.append('input')
                .attr('type', 'checkbox')
                .attr('id', `collapse-${label}`)
                .property('checked', false) // Start with checkboxes unchecked
                .on('change', function() {
                    if (this.checked) { // Checking the box now EXPANDS the node type
                        collapsedTypes.delete(label);
                    } else { // Unchecking the box COLLAPSES it
                        collapsedTypes.add(label);
                    }
                    const newGraphData = transformGraph();
                    renderGraph(newGraphData);
                });
            const labelElement = controlDiv.append('label').attr('for', `collapse-${label}`).style('color', color(label));
            labelElement.append('span')
                .attr('class', 'color-dot')
                .style('border-color', color(label));
            labelElement.node().append(document.createTextNode(` ${label}`));
        });
    }

    // --- Core Graph Interaction Functions (moved to outer scope) ---
    function handleClick(event, clickedNode) {
        event.stopPropagation();
        clearSearch();

        if (focusedNode === clickedNode) {
            // Clicked the same node again: unselect it
            focusedNode = null;
            focusedLink = null;
            nodeGroup.selectAll('.node').classed('selected', false);
            showAll();
        } else {
            // Clicked a new node: unselect all others and select this one
            if (nodeGroup) {
                nodeGroup.selectAll('.node').classed('selected', false);
            }
            focusedLink = null; // Unfocus any link
            if (event.currentTarget) {
                // A real click event has a target
                d3.select(event.currentTarget).select('.node').classed('selected', true);
            } else {
                // A simulated click needs to find the node in the selection
                nodeGroup.filter(d => d.id === clickedNode.id).select('.node').classed('selected', true);
            }

            focusedNode = clickedNode;
            updateInfoPanel(focusedNode, 'Node');
            let nodesToShow = new Set([clickedNode.id]);
            if (clickedNode.label === 'Application') {
                const oneHop = getNeighbors(clickedNode);
                oneHop.forEach(node => nodesToShow.add(node.id));
                oneHop.forEach(neighbor => {
                    const twoHop = getNeighbors(neighbor);
                    twoHop.forEach(node => nodesToShow.add(node.id));
                });
            } else {
                const oneHop = getNeighbors(clickedNode);
                oneHop.forEach(node => nodesToShow.add(node.id));
            }
            filterToNodes(nodesToShow);
        }
    }

    function getNeighbors(node) {
        const neighbors = new Set();
        // Use the currently rendered graph's links
        (graph.links || []).forEach(link => {
            if (link.source === node) neighbors.add(link.target);
            else if (link.target === node) neighbors.add(link.source);
        });
        return neighbors;
    }

    function filterToNodes(nodeIdSet) {
        if (!nodeGroup || !link || !linkLabel) return;
        nodeGroup.style('opacity', n => nodeIdSet.has(n.id) ? 1.0 : 0.1);
        link.style('opacity', l => (nodeIdSet.has(l.source.id) && nodeIdSet.has(l.target.id)) ? 0.8 : 0.05)
            .attr('stroke-width', l => (nodeIdSet.has(l.source.id) && nodeIdSet.has(l.target.id)) ? 2 : null);
        linkLabel.style('opacity', l => (nodeIdSet.has(l.source.id) && nodeIdSet.has(l.target.id)) ? 0.8 : 0.0);
    }

    function showAll() {
        if (!nodeGroup || !link || !linkLabel) return;
        nodeGroup.style('opacity', 1.0);
        link.style('opacity', 0.6).attr('stroke-width', null).style('stroke', null);
        clearInfoPanel();
        linkLabel.style('opacity', 1.0);
        
        // Find any node elements inside the groups and remove the hovered class
        nodeGroup.selectAll('.node').classed('hovered', false);
        // Also remove the selected class from all nodes when resetting the view
        nodeGroup.selectAll('.node').classed('selected', false);
    }

    function ticked() {
        if (!linkGroup || !nodeGroup) return;
        linkGroup.selectAll("path").attr("d", d => {
            const targetIntersection = getNodeIntersection(d.source, d.target, nodeWidth, nodeHeight);
            return `M${d.source.x},${d.source.y} L${targetIntersection.x},${targetIntersection.y}`;
        });
        nodeGroup.attr("transform", d => `translate(${d.x},${d.y})`);
    }

    // Calculates the intersection point of a line and a rectangle
    function getNodeIntersection(source, target, nodeWidth, nodeHeight) {
        const arrowheadPadding = 8; // Extra space for the arrowhead
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const gamma = Math.atan2(dy, dx); // Angle of the line

        const halfW = nodeWidth / 2 + arrowheadPadding;
        const halfH = nodeHeight / 2 + arrowheadPadding;

        // Calculate the intersection point on the rectangle's boundary
        const tanGamma = Math.tan(gamma);
        const x = Math.sign(dx) * halfW;
        const y = x * tanGamma;

        if (Math.abs(y) > halfH) {
            const y_ = Math.sign(dy) * halfH;
            return { x: target.x - y_ / tanGamma, y: target.y - y_ };
        }
        return { x: target.x - x, y: target.y - y };
    }

    // Encapsulate the entire rendering logic
    function renderGraph(currentGraph, nodeIdToFocus = null) {
        graph = currentGraph; // Update the global graph reference for search
        // Clear any existing SVG content
        console.log(`--- Rendering Graph ---`);
        console.log(`Receiving ${currentGraph.nodes.length} nodes and ${currentGraph.links.length} links.`);
        mainGroup.selectAll("*").remove();
        
        // --- Data pre-processing for robust linking ---
        const nodeMap = new Map(currentGraph.nodes.map(node => [node.id, node]));
        (currentGraph.links || []).forEach(link => {
            link.source = nodeMap.get(link.source) || link.source;
            link.target = nodeMap.get(link.target) || link.target;
        });
        const validLinks = currentGraph.links.filter(l => l.source && l.target);
        console.log(`After processing, found ${validLinks.length} valid links.`);

        // If there's an Enterprise node, fix it to the top-center position initially.
        // It can still be dragged by the user.
        const enterpriseNode = currentGraph.nodes.find(n => n.label === 'Enterprise');
        if (enterpriseNode) {
            // Only set initial position if it hasn't been moved by the user
            if (enterpriseNode.fx == null) enterpriseNode.fx = graphWidth / 2;
            if (enterpriseNode.fy == null) enterpriseNode.fy = height * 0.2;
        }

        // --- Adjacency list for hover interaction ---
        const linkedByIndex = {};
        validLinks.forEach(d => {
            const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
            const targetId = typeof d.target === 'object' ? d.target.id : d.target;
            linkedByIndex[`${sourceId},${targetId}`] = 1;
        });

        function areNodesConnected(a, b) {
            const sourceId = a.id;
            const targetId = b.id;
            return linkedByIndex[`${sourceId},${targetId}`] || linkedByIndex[`${targetId},${sourceId}`] || sourceId === targetId;
        }

        // --- Define Gradients for Node Colors ---
        const defs = svg.append("defs");
        const uniqueLabels = [...new Set(currentGraph.nodes.map(n => n.label))];
        uniqueLabels.forEach(label => {
            const gradient = defs.append("linearGradient")
                .attr("id", `gradient-${label.replace(/\s/g, '-')}`)
                .attr("x1", "0%").attr("y1", "0%")
                .attr("x2", "0%").attr("y2", "100%");
            const splitPercentage = "44%";
            gradient.append("stop").attr("offset", "0%").attr("stop-color", color(label));
            gradient.append("stop").attr("offset", splitPercentage).attr("stop-color", color(label));
            gradient.append("stop").attr("offset", splitPercentage).attr("stop-color", "#ffffff");
            gradient.append("stop").attr("offset", "100%").attr("stop-color", "#ffffff");
        });

        // Add arrowhead marker definition
        defs.append('marker')
            .attr('id', 'arrowhead')
            .attr('viewBox', '-0 -5 10 10')
            .attr('refX', 0) // The offset is now handled by shortening the path
            .attr('refY', 0)
            .attr('orient', 'auto')
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .append('svg:path')
            .attr('d', 'M0,-5L10,0L0,5')
            .attr('fill', '#999');

        // Add a click handler to the SVG background to reset the focus
        svg.on('click', (event) => {
            // Only reset if the click is on the background itself
            if (event.target === svg.node()) {
                clearSearch();
                focusedNode = null;
                focusedLink = null;
                showAll();
            }
        });

        // Create a group for each link, which will contain a visible and a clickable path
        linkGroup = mainGroup.append("g")
            .attr("class", "links")
            .selectAll("g")
            .data(validLinks)
            .join("g");

        // The visible line
        link = linkGroup.append("path")
            .attr("class", "link")
            .attr("id", (d, i) => `link-visible-${i}`)
            .attr('marker-end', 'url(#arrowhead)');

        // The invisible, wider click target
        linkGroup.append("path")
            .attr("class", "link-clickable")
            .attr("id", (d, i) => `link-clickable-${i}`)
            .on("click", (event, clickedLink) => {
                event.stopPropagation();
                focusedNode = null; // Unfocus any node
                focusedLink = clickedLink;
                nodeGroup.selectAll('.node').classed('selected', false); // Deselect nodes
                updateInfoPanel(clickedLink, 'Link');
            })
            .on("mouseover", (event, hoveredLink) => {
                if (!focusedNode && !focusedLink) {
                    updateInfoPanel(hoveredLink, 'Link');
                    link.style('opacity', l => l === hoveredLink ? 1.0 : 0.1);
                    linkLabel.style('opacity', l => l === hoveredLink ? 1.0 : 0.1);
                }
            })
            .on("mouseout", () => {
                handleMouseOut();
                if (!focusedNode && !focusedLink) {
                    link.style('opacity', 0.6);
                    linkLabel.style('opacity', 1.0);
                }
            });

        // Add link labels
        linkLabel = mainGroup.append("g")
            .attr("class", "link-labels")
            .selectAll("text.link-label")
            .data(validLinks)
            .join("text")
            .attr("class", "link-label")
            .append("textPath") // Use the visible link's ID for the text path
            .attr("xlink:href", (d, i) => `#link-visible-${i}`)
            .attr("startOffset", "50%")
            .text(d => d.type);

        // Create a group for each node
        nodeGroup = mainGroup.append("g")
            .attr("class", "nodes")
            .selectAll("g")
            .data(currentGraph.nodes, d => d.id)
            .join("g")
            .attr("class", "node-group")
            .call(drag(simulation))
            .on("click", handleClick);

        // Add rectangles to the node groups
        const node = nodeGroup.append("rect")
            .attr("class", d => `node ${d.label === 'Enterprise' ? 'enterprise-node' : ''}`)
            .attr("x", -nodeWidth / 2)
            .attr("y", -nodeHeight / 2)
            .attr("width", nodeWidth)
            .attr("height", nodeHeight)
            .attr("rx", 8)
            .attr("ry", 8)
            .attr("fill", d => d.isSummary ? color(d.originalLabel) : `url(#gradient-${d.label.replace(/\s/g, '-')})`)
            .on("mouseover", function(event, hoveredNode) {
                d3.select(this).classed('hovered', true);
                updateInfoPanel(hoveredNode, 'Node');
                if (!focusedNode) {
                    link.style('opacity', l => (l.source === hoveredNode || l.target === hoveredNode) ? 1.0 : 0.2)
                        .attr('stroke-width', l => (l.source === hoveredNode || l.target === hoveredNode) ? 2.5 : null);
                    linkLabel.style('opacity', l => (l.source === hoveredNode || l.target === hoveredNode) ? 1.0 : 0.2);
                }
            })
            .on("mouseout", function() {
                d3.select(this).classed('hovered', false);
                handleMouseOut();
                if (!focusedNode) {
                    link.style('opacity', 0.6).attr('stroke-width', null);
                    linkLabel.style('opacity', 1.0);
                }
            });

        // Add title label
        nodeGroup.append("text")
            .attr("class", d => d.isSummary ? "node-title-label summary-title-label" : "node-title-label")
            .attr("x", -nodeWidth / 2 + 8)
            .attr("y", -nodeHeight / 2 + 16)
            .text(d => {
                const label = d.isSummary ? d.originalLabel : d.label;
                const charLimit = 11;
                if (label.length > charLimit) {
                    return label.substring(0, charLimit) + '...';
                }
                return label;
            });

        // Add separator line
        nodeGroup.append("line")
            .attr("class", "node-separator")
            .attr("x1", -nodeWidth / 2)
            .attr("y1", -nodeHeight / 2 + 22)
            .attr("x2", nodeWidth / 2)
            .attr("y2", -nodeHeight / 2 + 22)
            .style("display", d => d.isSummary ? "none" : null);

        // Add name label
        nodeGroup.append("text")
            .attr("class", d => d.isSummary ? "node-name-label summary-label" : "node-name-label")
            .attr("y", d => d.isSummary ? 5 : 12)
            .text(d => {
                if (d.isSummary) return `${d.count} nodes`;
                if (d.label === 'ApplicationVersion') {
                    const version = d.properties.version;
                    if (typeof version === 'object' && version !== null) {
                        return version.low !== undefined ? version.low : JSON.stringify(version);
                    }
                    return version || '';
                }
                const props = d.properties;
                return getNodeName(d);
            })
            .call(truncate, 14); // Truncate main name after 14 characters

        // Add expand icon to summary nodes
        nodeGroup.filter(d => d.isSummary).append('image')
            .attr('class', 'expand-icon')
            .attr('xlink:href', 'assets/expand.png')
            .attr('x', nodeWidth / 2 - 16) // Position from right edge
            .attr('y', -nodeHeight / 2 + 4) // Position from top edge
            .attr('width', 12)
            .attr('height', 12)
            .append('title').text('Expand node group')
            .select(function() { return this.parentNode; }) // Go back to the image selection
            .on('click', (event, d) => {
                event.stopPropagation(); // Prevent node click handler from firing
                expandSingleGroup(d);
            });

        // Add contract icon to nodes that can be re-collapsed
        nodeGroup.filter(d => d.belongsToSummary).append('image')
            .attr('class', 'contract-icon')
            .attr('xlink:href', 'assets/contract.png')
            .attr('x', nodeWidth / 2 - 16)
            .attr('y', -nodeHeight / 2 + 4)
            .attr('width', 12)
            .attr('height', 12)
            .append('title').text('Collapse node group')
            .select(function() { return this.parentNode; }) // Go back to the image selection
            .on('click', (event, d) => {
                event.stopPropagation();
                contractSingleGroup(d);
            });

        // If a node was requested to be focused, find it and simulate a click
        if (nodeIdToFocus) {
            const nodeToSelect = currentGraph.nodes.find(n => n.id === nodeIdToFocus);
            if (nodeToSelect) {
                handleClick({ stopPropagation: () => {} }, nodeToSelect);
            }
        }

        // Add root icon to Enterprise node
        nodeGroup.filter(d => d.label === 'Enterprise').append('image')
            .attr('class', 'root-icon')
            .attr('xlink:href', 'assets/root.png')
            .attr('x', nodeWidth / 2 - 16)
            .attr('y', -nodeHeight / 2 + 4)
            .attr('width', 12)
            .attr('height', 12)
            .append('title').text('Root node')
            .select(function() { return this.parentNode; });

        // The simulation is created once, and forces are applied here.
        simulation.nodes(currentGraph.nodes);
        simulation.force("link").links(validLinks);
        applyForces(simulation, currentGraph, isHierarchyActive);
        simulation.alpha(0.3).restart(); // Reheat the simulation
    }

    // --- Search Functionality ---
    const searchContainer = d3.select(container).append('div')
        .attr('class', 'search-container');

    searchContainer.append('input')
        .attr('type', 'text')
        .attr('id', 'search-input')
        .attr('placeholder', 'Search nodes...');

    function clearSearch() {
        const searchInput = document.getElementById('search-input');
        if (searchInput && searchInput.value !== '') {
            searchInput.value = '';
            // Directly reset the view instead of re-filtering
            showAll();
        }
    }

    d3.select('#search-input').on('input', function(event) {
        const searchTerm = event.target.value.trim().toLowerCase();
        filterGraph(searchTerm);
    });

    function filterGraph(searchTerm) {
        if (!searchTerm) {
            // When search is cleared, reset the graph view
            showAll();
            return;
        }

        const matchingNodeIds = new Set();
        // Use the currently rendered graph data for searching
        graph.nodes.forEach(node => { 
            let title = '';
            let label = '';
            let name = '';
            let version = '';
            if (node.isSummary) {
                title = (node.originalLabel || '').toLowerCase();
            } else {
                label = (node.label || '').toLowerCase();
                title = (node.properties.title || node.label || '').toLowerCase();
                name = (getNodeName(node) || '').toLowerCase();
                version = (node.label === 'ApplicationVersion' && node.properties.version ? (node.properties.version.low || '').toString() : '').toLowerCase();
            }
            if (label.includes(searchTerm) || title.includes(searchTerm) || name.includes(searchTerm) || version.includes(searchTerm)) {
                matchingNodeIds.add(node.id);
            }
        });

        nodeGroup.style('opacity', n => matchingNodeIds.has(n.id) ? 1.0 : 0.1);
        link.style('opacity', l => (matchingNodeIds.has(l.source.id) || matchingNodeIds.has(l.target.id)) ? 0.6 : 0.1);
        linkLabel.style('opacity', l => (matchingNodeIds.has(l.source.id) || matchingNodeIds.has(l.target.id)) ? 1.0 : 0.1);
    }

    // Reusable helper function to truncate text within a given width.
    function truncate(textSelection, charLimit) {
        textSelection.each(function() {
            const textElement = d3.select(this);
            const initialText = textElement.text();
            if (initialText.length > charLimit) {
                const truncatedText = initialText.substring(0, charLimit) + '...';
                textElement.text(truncatedText);
            }
        });
    }

    // Helper function to get the display name for a node
    function getNodeName(node) {
        if (node.label === 'ApplicationVersion') {
            const version = node.properties.version;
            if (typeof version === 'object' && version !== null) {
                return version.low !== undefined ? version.low : JSON.stringify(version);
            }
            return version || '';
        }
        const props = node.properties;
        const nameKey = Object.keys(props).find(key => key.toLowerCase().includes('name'));
        return props.name || (nameKey ? props[nameKey] : undefined) || props.type || props.agent_name || props.title || props.action || '';
    }


    // --- Collapse/Expand Logic ---
    function transformGraph() {
        const isSolutionHierarchical = Object.keys(collapsedTypes).some(key => key.startsWith('4:'));

        if (!isSolutionHierarchical && collapsedTypes.size === 0) {
            console.log("No types to collapse, returning original graph.");
            return originalGraph;
        }

        console.log(`--- Transforming Graph ---`);
        console.log(`Collapsing types:`, collapsedTypes);

        let finalNodes = [...originalGraph.nodes];
        const summaryNodesMap = new Map();
        const nodeToFinalNodeMap = new Map();

        // First pass: determine final representation for each node
        originalGraph.nodes.forEach(node => {
            let isCollapsed = false;
            if (isSolutionHierarchical) {
                // Find which solution this node might be collapsed under
                for (const solutionId in collapsedTypes) {
                    if (collapsedTypes[solutionId].has(node.label)) {
                        // Check if this node is a neighbor of this solution
                        const isNeighbor = originalGraph.links.some(l => (l.source === solutionId && l.target === node.id) || (l.target === solutionId && l.source === node.id));
                        if (isNeighbor) {
                            const summaryId = `summary-${solutionId}-${node.label}`;
                            if (!summaryNodesMap.has(summaryId)) {
                                summaryNodesMap.set(summaryId, {
                                    id: summaryId, label: 'Summary', isSummary: true, originalLabel: node.label, count: 0, properties: { containedNodes: [] }, solutionId: solutionId
                                });
                            }
                            const summaryNode = summaryNodesMap.get(summaryId);
                            summaryNode.count++;
                            summaryNode.properties.containedNodes.push({ id: node.id, name: getNodeName(node) });
                            nodeToFinalNodeMap.set(node.id, summaryNode);
                            isCollapsed = true;
                            break; // Node can only be part of one summary
                        }
                    }
                }
            } else {
                // Global collapse logic
                if (collapsedTypes.has(node.label)) {
                    const summaryId = `summary-${node.label}`;
                     if (!summaryNodesMap.has(summaryId)) {
                        summaryNodesMap.set(summaryId, {
                            id: summaryId, label: 'Summary', isSummary: true, originalLabel: node.label, count: 0, properties: { containedNodes: [] }
                        });
                    }
                    const summaryNode = summaryNodesMap.get(summaryId);
                    summaryNode.count++;
                    summaryNode.properties.containedNodes.push({ id: node.id, name: getNodeName(node) });
                    nodeToFinalNodeMap.set(node.id, summaryNode);
                    isCollapsed = true;
                }
            }

            if (!isCollapsed) {
                nodeToFinalNodeMap.set(node.id, node);
            }
        });

        // Filter out the nodes that have been collapsed and add the new summary nodes
        finalNodes = finalNodes.filter(node => nodeToFinalNodeMap.get(node.id) === node);
        finalNodes.push(...summaryNodesMap.values());

        // Rebuild links
        const finalLinks = [];
        const linkSet = new Set(); // To prevent duplicate links
        originalGraph.links.forEach(link => {
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;

            const finalSource = nodeToFinalNodeMap.get(sourceId);
            const finalTarget = nodeToFinalNodeMap.get(targetId);

            if (finalSource && finalTarget && finalSource.id !== finalTarget.id) {
                const linkKey = [finalSource.id, finalTarget.id].sort().join('--');
                if (linkSet.has(linkKey)) return;
                linkSet.add(linkKey);
                finalLinks.push({
                    source: finalSource.id, target: finalTarget.id, type: link.type
                });
            }
        });

        console.log(`Transformation complete. New graph has ${finalNodes.length} nodes and ${finalLinks.length} links.`);
        return { nodes: finalNodes, links: finalLinks };
    }

    function applyForces(simulation, graphData, hierarchyEnabled) {
        if (hierarchyEnabled && graphData.nodes.some(n => n.label === 'Enterprise')) {
            // Apply hierarchical forces
            simulation
                .force("y", d3.forceY(d => {
                    switch (d.label) {
                        case 'Enterprise': return height * 0.2; // Top layer, moved down a bit
                        case 'Solution': return height * 0.4;   // Middle layer
                        default: return height * 0.75;          // Bottom layer
                    }
                }).strength(0.1))
                .force("x", d3.forceX(graphWidth / 2).strength(0.01)); // Weaker X force
        } else {
            // Apply default "natural" forces
            simulation
                .force("y", d3.forceY((height - bottomPadding) / 2).strength(0.1))
                .force("x", d3.forceX(graphWidth / 2).strength(0.02));
        }
        // After setting forces, restart the simulation if it exists
        if (simulation) {
            simulation.alpha(0.5).restart();
        }
    }

    // Drag and drop functionality
    function drag(simulation) {
        function dragstarted(event) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            event.subject.fx = event.subject.x;
            event.subject.fy = event.subject.y;
        }

        function dragged(event) {
            event.subject.fx = event.x;
            event.subject.fy = event.y;
        }

        function dragended(event) {
            if (!event.active) simulation.alphaTarget(0);
            // For Enterprise nodes, keep them fixed after dragging.
            if (event.subject.label !== 'Enterprise') {
                event.subject.fx = null;
                event.subject.fy = null;
            }
        }

        return d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended);
    }

    // Append the main SVG to the container once
    container.insertBefore(svg.node(), searchContainer.node());

    // Create the initial simulation object
    simulation = d3.forceSimulation()
        .force("link", d3.forceLink().id(d => d.id).distance(200))
        .force("charge", d3.forceManyBody().strength(-550))
        .force("center", d3.forceCenter(graphWidth / 2, height / 2))
        .force("collide", d3.forceCollide().radius(d => {
            // Give Solution nodes a larger collision radius to push them apart
            if (d.label === 'Solution') {
                return (Math.max(nodeWidth, nodeHeight) / 2) * 2.5;
            }
            return (Math.max(nodeWidth, nodeHeight) / 2) + 5;
        }).strength(0.9))
        .on("tick", ticked);

    // Initial render
    renderGraph(transformGraph());
});