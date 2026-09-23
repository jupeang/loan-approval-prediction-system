from flask import Flask, request, jsonify, render_template, redirect, url_for, session, flash
from werkzeug.security import generate_password_hash, check_password_hash
from pymongo import MongoClient
import pickle, pandas as pd
from datetime import datetime, timedelta

app = Flask(__name__)
app.secret_key = "your_secret_key_here"
app.permanent_session_lifetime = timedelta(minutes=30)

# ===== MongoDB Setup =====
client = MongoClient("mongodb://localhost:27017/")
db = client['loan_app_db']
users_col = db['users']
loans_col = db['loans']

# ===== Load ML model =====
try:
    pipeline = pickle.load(open('loan_approval_pipeline.pkl', 'rb'))
except:
    pipeline = None

# ===== Home =====
@app.route('/')
def home():
    if 'user_id' in session:
        return redirect(url_for('loan_form'))
    return redirect(url_for('login'))

# ===== Login =====
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']
        user = users_col.find_one({"email": email})

        if user and check_password_hash(user['password'], password):
            session.permanent = True
            session['user_id'] = str(user['_id'])
            session['email'] = user['email']
            flash("Logged in successfully!", "success")
            return redirect(url_for('loan_form'))
        else:
            flash("Invalid credentials", "danger")

    return render_template('login.html')

# ===== Register =====
@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        name = request.form['name']
        email = request.form['email']
        password = request.form['password']
        confirm = request.form['confirm_password']

        if password != confirm:
            flash("Passwords do not match", "danger")
            return render_template('register.html')

        if users_col.find_one({"email": email}):
            flash("Email already registered", "danger")
            return render_template('register.html')

        hashed_pw = generate_password_hash(password)
        users_col.insert_one({"name": name, "email": email, "password": hashed_pw})

        flash("Account created! Please login.", "success")
        return redirect(url_for('login'))

    return render_template('register.html')

# ===== Logout =====
@app.route('/logout')
def logout():
    session.clear()
    flash("Logged out", "info")
    return redirect(url_for('login'))

# ===== Loan Form =====
@app.route('/loan_form')
def loan_form():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    return render_template('index.html')

# ===== WEB PREDICT (HTML FORM) =====
@app.route('/predict', methods=['POST'])
def predict():
    if 'user_id' not in session:
        return redirect(url_for('login'))

    data = {key: request.form[key] for key in request.form}

    numeric_fields = [
        'Dependents', 'ApplicantIncome', 'CoapplicantIncome',
        'LoanAmount', 'Loan_Amount_Term', 'Credit_History'
    ]

    for field in numeric_fields:
        data[field] = float(data[field])

    result_text, reason_text = evaluate_loan(data)

    # Save to DB
    loan_doc = {
        "user_id": session['user_id'],
        "timestamp": datetime.now(),
        "data": data,
        "result": result_text,
        "reason": reason_text
    }
    loans_col.insert_one(loan_doc)

    previous_loans = list(loans_col.find(
        {"user_id": session['user_id']}
    ).sort("timestamp", -1))

    return render_template(
        "single_prediction1.html",
        result=result_text,
        reason=reason_text,
        previous_loans=previous_loans
    )

# ===== USSD / API ROUTE (🔥 IMPORTANT) =====
@app.route('/api/loan-check', methods=['POST'])
def api_loan_check():
    try:
        data = request.json

        numeric_fields = [
            'Dependents', 'ApplicantIncome', 'CoapplicantIncome',
            'LoanAmount', 'Loan_Amount_Term', 'Credit_History'
        ]

        for field in numeric_fields:
            data[field] = float(data.get(field, 0))

        result_text, reason_text = evaluate_loan(data)

        return jsonify({
            "result": result_text,
            "reason": reason_text
        })

    except Exception as e:
        print("API ERROR:", str(e))
        return jsonify({
            "result": "Error",
            "reason": str(e)
        }), 500


# ===== SHARED LOAN LOGIC =====
def evaluate_loan(data):
    is_approved = True
    reasons = []

    if data['Credit_History'] == 0:
        reasons.append("Poor Credit History")
        is_approved = False

    if data['ApplicantIncome'] < 250000:
        reasons.append("Low Applicant Income")
        is_approved = False

    if data['CoapplicantIncome'] < 15000:
        reasons.append("Low Coapplicant Income")
        is_approved = False

    if data['LoanAmount'] < 100000:
        reasons.append("Low Loan Amount")
        is_approved = False

    if data['Loan_Amount_Term'] < 180:
        reasons.append("Short Loan Term")
        is_approved = False

    if data['Dependents'] >= 3:
        reasons.append("Too Many Dependents")
        is_approved = False

    if data['Property_Area'] == 'Rural':
        reasons.append("Rural Property Area")
        is_approved = False

    result_text = "Approved" if is_approved else "Rejected"
    reason_text = "; ".join(reasons) if reasons else "All conditions satisfied"

    return result_text, reason_text


# ===== RUN SERVER =====
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)