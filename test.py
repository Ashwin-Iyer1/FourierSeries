from flask import Flask, jsonify, request
from flask_cors import CORS
import numpy as np
from scipy.integrate import quad

app = Flask(__name__)
CORS(app)  # Enable CORS to allow requests from the frontend

# Function to calculate Fourier coefficients
def fourier(l, n, f):
    # Calculate the a0 coefficient (center)
    a0 = (1 / l) * quad(lambda x: f(x), -l, l)[0]
    A = []  # List to store A (cosine) coefficients
    B = []  # List to store B (sine) coefficients
    for i in range(1, n + 1):
        f1 = lambda x: f(x) * np.cos(i * np.pi * x / l)
        f2 = lambda x: f(x) * np.sin(i * np.pi * x / l)
        A_i = (1 / l) * quad(f1, -l, l)[0]
        B_i = (1 / l) * quad(f2, -l, l)[0]
        A.append(A_i)
        B.append(B_i)
    return a0, A, B

# Example function: Semi-circle
def f(x):
    if x > 1 or x < -1:
        return 0
    return np.sqrt(1 - x**2)

# Route to get Fourier coefficients
@app.route('/fourier_coefficients')
def get_coefficients():
    l = np.pi * 2  # Period of the function
    n = int(request.args.get('n', 20))  
    a0, A, B = fourier(l, n, f)
    return jsonify({"a0": a0, "A": A, "B": B})

if __name__ == "__main__":
    app.run(port=5001)