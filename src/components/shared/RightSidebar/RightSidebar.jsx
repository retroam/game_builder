import React, { useState } from "react";
import EditTab from "./EditTab.jsx";
import PlayTab from "./PlayTab.jsx";

/**
 * RightSidebar - Contains Edit and Play tabs for game configuration and generation
 */
export default function RightSidebar({ 
  world,
  characters,
  platforms,
  background,
  onCharactersChange,
  onBackgroundChange,
  onWorldChange
}) {
  const [activeTab, setActiveTab] = useState("edit");

  const TabButton = ({ id, active, onClick, children }) => (
    <button
      onClick={onClick}
      className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active
          ? "text-blue-600 border-blue-600"
          : "text-gray-600 border-transparent hover:text-gray-800 hover:border-gray-300"
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="w-80 border-l border-neutral-200 bg-white flex flex-col">
      {/* Tab Headers */}
      <div className="flex border-b border-neutral-200">
        <TabButton
          id="edit"
          active={activeTab === "edit"}
          onClick={() => setActiveTab("edit")}
        >
          🎯 Edit
        </TabButton>
        <TabButton
          id="play"
          active={activeTab === "play"}
          onClick={() => setActiveTab("play")}
        >
          🎮 Play
        </TabButton>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "edit" && (
          <EditTab
            world={world}
            characters={characters}
            platforms={platforms}
            background={background}
            onCharactersChange={onCharactersChange}
            onBackgroundChange={onBackgroundChange}
            onWorldChange={onWorldChange}
          />
        )}
        {activeTab === "play" && (
          <PlayTab
            world={world}
            characters={characters}
            platforms={platforms}
            background={background}
          />
        )}
      </div>
    </div>
  );
}