import csv
import numpy as np
from scipy.interpolate import interp1d

def csv_to_function(file_path):
    # Read CSV file
    x_points = []
    y_points = []
    
    with open(file_path, mode='r') as file:
        reader = csv.DictReader(file)
        for row in reader:
            x_points.append(float(row['x']))
            y_points.append(float(row['y']))
    
    # Create an interpolating function
    f_interp = interp1d(x_points, y_points, kind='cubic', fill_value="extrapolate")
    
    return f_interp, min(x_points), max(x_points)

# Example usage
csv_path = 'logo.csv'  # Replace with your CSV file path
f2, x_min, x_max = csv_to_function(csv_path)

# f2(x) can now be used as the function in your Fourier calculations.
