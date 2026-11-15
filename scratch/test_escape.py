import re, json

s = '{"test": "$$a \\cdot b = a \\times b \\unit \\sum \\frac{1}{2}$$"}'
print("Original:", s)

def fix_json_escapes(raw):
    # Match backslash NOT followed by valid JSON escape: ", \, /, b, f, n, r, t, or uXXXX
    pattern = r'\\(?!(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))'
    return re.sub(pattern, r'\\\\', raw)

fixed = fix_json_escapes(s)
print("Fixed:", fixed)
parsed = json.loads(fixed)
print("Parsed successfully:", parsed)
