# Perfect Maze Generator

A web-based application for generating and perfect mazes with a hand-drawn aesthetic.

![Maze Generator Screenshot](assets/images/screenshot.png)

## Features

- Generate random mazes with customizable seeds
- Resize maze dimensions by dragging the bottom-right corner
- Adjust cell size using the mouse wheel
- Trace the path from entrance to exit
- Download mazes as SVG or PNG
- Responsive design for various screen sizes
- Hand-drawn aesthetic using Rough.js

## How to Use

1. **Generate a Maze**: Enter a seed number or click the reload button to create a new random maze
2. **Adjust Cell Size**: Use your mouse wheel over the maze to make cells larger or smaller
3. **Resize the Maze**: Drag the bottom-right corner to change dimensions
4. **Trace the Path**: Click and drag to trace the path from entrance to exit
5. **Download**: Save your maze as an SVG or PNG file using the download buttons
6. **Download Multiple Mazes**: Create a PDF with multiple mazes on a single page using the "Multiple Mazes" button
7. **Reset Path**: Clear your traced path with the reset button

## Implementation

The maze is generated using a depth-first search algorithm with a randomized approach, ensuring that:
- Every maze has exactly one path between any two points
- There are no loops or isolated walls
- The entrance and exit are placed on opposite sides

## Dependencies

- [Rough.js](https://roughjs.com/) - Library used for the hand-drawn aesthetic (MIT License)
- [jsPDF](https://github.com/parallax/jsPDF) - Library used for PDF generation (MIT License)
- [Nanum Pen Script](https://fonts.google.com/specimen/Nanum+Pen+Script) - Google Font used for the handwritten text style (SIL Open Font License). The font is bundled with this project for offline use. See the included OFL.txt file for the full license text.

## Installation

Simply clone this repository and open `index.html` in a web browser:

```
git clone https://github.com/codeprimate/mywebmaze.git
cd mywebmaze
```

No build process or server is required.

## URL Parameters

- Add `#12345` to the URL to generate a specific maze seed
- Add `?debug` after the seed to enable debug mode

## License

Copyright © 2025 codeprimate. MIT license.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE. 