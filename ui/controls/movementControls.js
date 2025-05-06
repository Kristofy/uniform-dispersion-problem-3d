export function createMovementControls(container, renderer) {
    // Only keep camera reset control, remove WASD and wireframe UI
    const buttonStyle = `
    padding: 6px 10px; 
    margin-right: 5px; 
    margin-bottom: 5px; 
    cursor: pointer; 
    border: 1px solid #444; 
    background-color: #333; 
    color: white;
    `;
    const resetViewButton = document.createElement('button');
    resetViewButton.textContent = 'Reset Camera';
    resetViewButton.style.cssText = buttonStyle + 'width: 100%;';
    resetViewButton.onclick = () => {
        renderer.resetCameraView();
    };
    // group reset under a single sub-container
    const secondaryControls = document.createElement('div');
    secondaryControls.style.display = 'flex';
    secondaryControls.style.flexDirection = 'column';
    secondaryControls.style.marginTop = '10px';
    // Reset Camera button
    secondaryControls.appendChild(resetViewButton);
    container.appendChild(secondaryControls);
}
//# sourceMappingURL=movementControls.js.map