import React, { useState, useCallback, useRef } from "react";
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
} from "reactflow";
import { useDrag, useDrop } from "react-dnd";
import "reactflow/dist/style.css";
import { Undo, RefreshCw, Upload, Download, X, Eye } from "lucide-react";

const DraggableItem = ({ id, text, name, onDrop, onView }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: "node",
    item: { id, text, name },
    end: (item, monitor) => {
      const dropResult = monitor.getDropResult();
      if (item && dropResult) {
        onDrop(item, dropResult);
      }
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  return (
    <div
      ref={drag}
      className={`p-2 mb-2 bg-[#90b3ff] rounded border-[1px] border-[#C9DFFF] shadow-[#9ec4fe] shadow-sm cursor-move ${
        isDragging ? "opacity-50" : "opacity-100"
      } flex justify-between items-center`}
    >
      <span>{name}</span>
      <button
        onClick={() => onView(id, text)}
        className="text-gray-700 hover:text-gray-900"
      >
        <Eye size={16} />
      </button>
    </div>
  );
};

const ViewPopup = ({ text, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">View Content</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X size={24} />
          </button>
        </div>
        <pre className="bg-gray-100 p-4 rounded whitespace-pre-wrap">
          {text}
        </pre>
      </div>
    </div>
  );
};

const Loader = () => (
  <div className="inline-block animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-500 mr-2"></div>
);

const FlowDiagramCreator = () => {
  const [inputText, setInputText] = useState("");
  const [promptName, setPromptName] = useState("");
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [nextId, setNextId] = useState(1);
  const [items, setItems] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const reactFlowWrapper = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const fileInputRef = useRef(null);
  const [selectedFormat, setSelectedFormat] = useState(".py");
  const [isLoading, setIsLoading] = useState(false);
  const [viewingItem, setViewingItem] = useState(null);

  const handleUpload = (event) => {
    const files = Array.from(event.target.files);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target.result;
        const newFile = {
          id: `file-${nextId}`,
          name: file.name,
          content: content,
        };
        setUploadedFiles((prevFiles) => [...prevFiles, newFile]);
        setNextId(nextId + 1);
      };
      reader.readAsText(file);
    });
  };

  const removeUploadedFile = (fileId) => {
    setUploadedFiles((prevFiles) =>
      prevFiles.filter((file) => file.id !== fileId)
    );
  };

  const handleDownload = () => {
    const content = generatePreview();
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flow-diagram${selectedFormat}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  const handlePromptNameChange = (e) => {
    setPromptName(e.target.value);
  };

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const handleInputChange = (e) => {
    setInputText(e.target.value);
  };

  const extractCodeBlocks = (text) => {
    const codeBlockRegex = /```([\s\S]*?)```/g;
    let match;
    const codeBlocks = [];

    while ((match = codeBlockRegex.exec(text)) !== null) {
        let codeBlock = match[1].trim();
        codeBlocks.push(...processCodeBlock(codeBlock));
    }

    if (codeBlocks.length === 0) {
        codeBlocks.push(...processCodeBlock(text));
    }

    return codeBlocks;
  };

  const processCodeBlock = (block) => {
    block = block.replace(/^python\s*/i, '').trim();

    const parts = block.split(/---/).map(part => part.trim());

    return parts.filter(part => part.length > 0);
  };

  const handleCreateItems = async () => {
    setIsLoading(true);
    try {
      let userPrompt = inputText;
      
      if (uploadedFiles.length > 0) {
        const fileContents = uploadedFiles
          .map((file) => `${file.name}:\n${file.content}`)
          .join("\n\n");
        userPrompt += `\n\nFile contents:\n${fileContents}`;
      }

      userPrompt += ". Don't add any other statements in your response. Just the code part.";

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4",
          messages: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.7
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.error) {
        console.error('API Error:', data.error);
        return;
      }

      const generatedText = data.choices[0].message.content.trim();
      console.log("Generated Text:", generatedText);
      const codeBlocks = extractCodeBlocks(generatedText);
      console.log("Extracted Code Blocks:", codeBlocks);
      const newItem = {
        id: `item-${nextId}`,
        name: promptName || `Prompt ${nextId}`,
        text: codeBlocks.join("\n\n"),
      };
      console.log("New Item:", newItem);
      setItems((prevItems) => [...prevItems, newItem]);
      setNextId(nextId + 1);
      setInputText("");
      setPromptName("");

      // Log token usage
      console.log("Token Usage:", data.usage);

    } catch (error) {
      console.error("Error fetching API response:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUndo = () => {
    setEdges((eds) => eds.slice(0, -1));
  };

  const handleReset = () => {
    setNodes([]);
    setEdges([]);
    setNextId(1);
    setItems([]);
  };

  const onDrop = useCallback(
    (item, dropResult) => {
      if (reactFlowInstance) {
        const position = reactFlowInstance.project({
          x: dropResult.x,
          y: dropResult.y,
        });
        const newNode = {
          id: item.id,
          type: "default",
          position,
          data: { label: item.name, fullText: item.text },
        };
        setNodes((nds) => nds.concat(newNode));
      }
    },
    [reactFlowInstance, setNodes]
  );

  const [, drop] = useDrop(() => ({
    accept: "node",
    drop: (item, monitor) => {
      const offset = monitor.getClientOffset();
      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      return {
        x: offset.x - bounds.left,
        y: offset.y - bounds.top,
      };
    },
  }));

  const generatePreview = () => {
    const connectedNodes = new Set();
    const nodeConnections = {};
    
    nodes.forEach(node => {
      nodeConnections[node.id] = { inbound: 0, outbound: 0 };
    });
  
    edges.forEach((edge) => {
      connectedNodes.add(edge.source);
      connectedNodes.add(edge.target);
      nodeConnections[edge.source].outbound++;
      nodeConnections[edge.target].inbound++;
    });
  
    const sortedNodes = nodes
      .filter((node) => connectedNodes.has(node.id))
      .sort((a, b) => {
        if (nodeConnections[a.id].inbound === 0 && nodeConnections[b.id].inbound > 0) return -1;
        if (nodeConnections[b.id].inbound === 0 && nodeConnections[a.id].inbound > 0) return 1;
  
        const aTotalConnections = nodeConnections[a.id].inbound + nodeConnections[a.id].outbound;
        const bTotalConnections = nodeConnections[b.id].inbound + nodeConnections[b.id].outbound;
        
        if (aTotalConnections !== bTotalConnections) {
          return bTotalConnections - aTotalConnections;
        }
  
        return nodes.indexOf(a) - nodes.indexOf(b);
      });
  
    return sortedNodes.map((node) => node.data.fullText).join("\n\n");
  };

  const handleViewItem = (id, text) => {
    setViewingItem({ id, text });
  };

  const handleCloseView = () => {
    setViewingItem(null);
  };

  return (
    <div className="h-screen flex justify-between bg-[#12161D]">
      <div className="flex flex-col w-[76vw]">
        <div className="mx-[1vw] w-[75.8vw] my-[0.5vh] bg-[#12161D] shadow-md">
          <div className="flex space-x-2">
            <textarea
              className="w-2/3 text-gray-100 bg-[#091327] p-3 focus:shadow-md focus:shadow-[#5694FE] border border-[#5694FE] rounded-lg focus:ring-[1px] focus:ring-[#5094fb] focus:border-transparent resize-none"
              rows="4"
              value={inputText}
              onChange={handleInputChange}
              placeholder="Enter your prompt..."
            />
            <div className="w-1/3 bg-[#091327] p-3 border border-[#5694FE] rounded-lg overflow-y-auto max-h-[150px]">
              <h4 className="text-gray-300 font-semibold mb-2">
                Uploaded Files:
              </h4>
              {uploadedFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex justify-between items-center text-gray-300 mb-1"
                >
                  <span>{file.name}</span>
                  <button
                    onClick={() => removeUploadedFile(file.id)}
                    className="text-red-500"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-between mt-[0.5vh]">
            <div className="space-x-2 flex items-center">
              <input
                type="text"
                value={promptName}
                onChange={handlePromptNameChange}
                placeholder="Prompt name"
                className="px-3 py-2 bg-[#091327] text-gray-100 border border-[#5694FE] rounded-lg focus:ring-[1px] focus:ring-[#5094fb] focus:border-transparent"
              />
              <button
                className="px-6 py-2 bg-[#1E4289] text-white rounded-full hover:bg-[#315DB0] transition duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 flex items-center"
                onClick={handleCreateItems}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader />
                    Processing...
                  </>
                ) : (
                  "Create Items"
                )}
              </button>
              <button
                className="px-6 py-2 bg-[#1E4289] text-white rounded-full hover:bg-[#315DB0] transition duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                onClick={triggerFileInput}
              >
                <Upload size={20} className="inline mr-2" />
                Upload
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleUpload}
                className="hidden"
                accept=".txt,.js,.py,.html,.css,.json"
              />
            </div>
            <div className="space-x-2">
              <button
                className="px-4 py-2 bg-gray-600 text-white rounded-l-full hover:bg-gray-700 transition duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50"
                onClick={handleUndo}
                title="Undo last connection"
              >
                <Undo size={20} />
              </button>
              <button
                className="px-4 py-2 bg-red-600 text-white rounded-r-full hover:bg-red-700 transition duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
                onClick={handleReset}
                title="Reset all nodes"
              >
                <RefreshCw size={20} />
              </button>
            </div>
          </div>
        </div>
        <ReactFlowProvider>
          <div className="h-[75vh] flex-grow relative" ref={reactFlowWrapper}>
            <div ref={drop} className="h-[70vh]">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onInit={setReactFlowInstance}
                fitView
                className="bg-[#12161D] m-[2vh] border-[1px] border-[#5694FE] rounded-xl shadow-sm shadow-sm-[#5694FE]"
              >
                <Background
                  variant="dots"
                  gap={20}
                  size={1}
                  color="#ffffff"
                  style={{ backgroundColor: "#12161D" }}
                />
                <Controls />
              </ReactFlow>
            </div>
          </div>
        </ReactFlowProvider>
        <div className="p-6 w-[98.9vw] relative bg-[#12161D] shadow-md">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-lg text-gray-300">Preview:</h3>
            <div className="flex items-center">
              <select
                className="mr-2 bg-[#091327] text-gray-300 border border-[#5694FE] rounded-md p-1"
                value={selectedFormat}
                onChange={(e) => setSelectedFormat(e.target.value)}
              >
                {[
                  ".java",
                  ".py",
                  ".js",
                  ".jsx",
                  ".ts",
                  ".tsx",
                  ".cpp",
                  ".c",
                ].map((format) => (
                  <option key={format} value={format}>
                    {format}
                  </option>
                ))}
              </select>
              <button
                className="flex items-center px-4 py-2 bg-[#1E4289] text-white rounded-full hover:bg-[#315DB0] transition duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                onClick={handleDownload}
              >
                <Download size={20} className="mr-2" />
                Download
              </button>
            </div>
          </div>
          <pre className="bg-[#153475] p-3 rounded-lg border border-gray-200 text-gray-300 whitespace-pre-wrap overflow-x-auto">
            {generatePreview()}
          </pre>
        </div>
      </div>
      <div className="w-[21vw] p-2 bg-[#091327] border-l-[1px] border-[#5694FE] h-[100vh] overflow-scroll">
        <h2 className="text-xl font-bold mb-4 text-gray-300 border-b-[2px] border-spacing-1 border-dashed border-[#2a5cc1]">
          Draggable Items
        </h2>
        {items.map((item) => (
          <DraggableItem
            key={item.id}
            id={item.id}
            text={item.text}
            name={item.name}
            onDrop={onDrop}
            onView={handleViewItem}
          />
        ))}
      </div>
      {viewingItem && (
        <ViewPopup text={viewingItem.text} onClose={handleCloseView} />
      )}
    </div>
  );
};

export default FlowDiagramCreator;