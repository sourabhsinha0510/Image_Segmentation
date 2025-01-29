document.addEventListener("DOMContentLoaded", function () {
  const uploadImageInput = document.getElementById("uploadImage");
  const imageGrid = document.getElementById("imageGrid");
  const selectedSegmentsInput = document.getElementById("selectedSegments");
  let selectedSegments = [];

  // Function to create the 4x4 grid
  function createGrid(image) {
    const rows = 4;
    const cols = 4;
    const segmentWidth = image.width / cols;
    const segmentHeight = image.height / rows;

    imageGrid.style.position = "relative";
    imageGrid.style.width = `${image.width}px`;
    imageGrid.style.height = `${image.height}px`;
    imageGrid.innerHTML = ""; // Clear previous grid

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const segment = document.createElement("div");
        segment.classList.add("segment");
        segment.style.position = "absolute";
        segment.style.left = `${col * segmentWidth}px`;
        segment.style.top = `${row * segmentHeight}px`;
        segment.style.width = `${segmentWidth}px`;
        segment.style.height = `${segmentHeight}px`;
        segment.style.border = "1px solid #ddd";
        segment.style.backgroundImage = `url(${image.src})`;
        segment.style.backgroundPosition = `-${col * segmentWidth}px -${row * segmentHeight}px`;
        segment.style.backgroundSize = `${image.width}px ${image.height}px`;
        segment.style.cursor = "pointer";

        // Toggle selection
        segment.addEventListener("click", () => {
          const segmentId = `${row}-${col}`;
          if (selectedSegments.includes(segmentId)) {
            selectedSegments = selectedSegments.filter((id) => id !== segmentId);
            segment.classList.remove("selected");
          } else {
            selectedSegments.push(segmentId);
            segment.classList.add("selected");
          }

          // Update hidden input
          selectedSegmentsInput.value = JSON.stringify(selectedSegments);
        });

        imageGrid.appendChild(segment);
      }
    }
  }

  // Handle image upload
  uploadImageInput.addEventListener("change", () => {
    const file = uploadImageInput.files[0];
    if (!file) {
      alert("No file selected.");
      return;
    }

    const image = new Image();
    image.src = URL.createObjectURL(file);
    

    image.onload = () => {
      createGrid(image); // Create the grid after image loads
    };

    image.onerror = () => alert("Failed to load the image.");

    
  });
});
