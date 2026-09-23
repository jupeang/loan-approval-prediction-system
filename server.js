const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const mongoose = require('mongoose');

const app = express();
const PORT = 3000;

// ================= DATABASE =================
mongoose.connect('mongodb://127.0.0.1:27017/ussd-loan-app')
    .then(() => console.log("MongoDB Connected"))
    .catch(err => console.log(err));

// ================= SCHEMA =================
const loanSchema = new mongoose.Schema({
    phoneNumber: String,
    gender: String,
    married: String,
    education: String,
    selfEmployed: String,
    propertyArea: String,
    amount: Number,
    income: Number,
    coapplicantIncome: Number,
    existingLoans: Number,
    status: String,
    reason: String,
    loanID: String,
    createdAt: { type: Date, default: Date.now }
});

const Loan = mongoose.model('Loan', loanSchema);

// ================= MIDDLEWARE =================
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Temporary session storage
const sessions = {};

// ================= USSD ROUTE =================
app.post('/ussd', async (req, res) => {
    try {
        const { text = '', phoneNumber } = req.body;
        const textArray = text.split('*').map(t => t.trim());
        let response = '';

        const isValidNumber = (val) => !isNaN(val) && Number(val) >= 0;

        // ===== MAIN MENU =====
        if (text === '') {
            response = `CON Welcome to Loan App
1. My Account
2. Apply Loan
3. Exit`;
        }

        // ===== MY ACCOUNT =====
        else if (textArray[0] === '1') {

            if (textArray.length === 1) {
                response = `CON My Account
1. Check Balance
2. Loan Status
3. Back`;
            }

            else if (textArray[1] === '1') {
                response = `END Your balance is KES 10,000`;
            }

            else if (textArray[1] === '2' && textArray.length === 2) {
                response = `CON Enter Loan ID:`;
            }

            else if (textArray[1] === '2' && textArray.length === 3) {
                const loanID = textArray[2];

                const loan = await Loan.findOne({ loanID });

                if (loan) {
                    response = `END Loan ID: ${loan.loanID}
Amount: KES ${loan.amount}
Applicant Income: ${loan.income}
Status: ${loan.status}
Reason: ${loan.reason}`;
                } else {
                    response = `END Loan not found`;
                }
            }

            else {
                response = `END Invalid option`;
            }
        }

        // ===== APPLY LOAN =====
        else if (textArray[0] === '2') {

            // Step 1
            if (textArray.length === 1) {
                response = `CON Gender:
1. Male
2. Female`;
            }

            // Step 2
            else if (textArray.length === 2) {
                if (!['1','2'].includes(textArray[1])) {
                    response = `CON Invalid. Enter Gender:
1. Male
2. Female`;
                } else {
                    sessions[phoneNumber] = {
                        gender: textArray[1] === '1' ? 'Male' : 'Female'
                    };
                    response = `CON Married?
1. Yes
2. No`;
                }
            }

            // Step 3
            else if (textArray.length === 3) {
                if (!['1','2'].includes(textArray[2])) {
                    response = `CON Invalid. Married?
1. Yes
2. No`;
                } else {
                    sessions[phoneNumber].married = textArray[2] === '1' ? 'Yes' : 'No';
                    response = `CON Education:
1. Graduate
2. Not Graduate`;
                }
            }

            // Step 4
            else if (textArray.length === 4) {
                if (!['1','2'].includes(textArray[3])) {
                    response = `CON Invalid. Education:
1. Graduate
2. Not Graduate`;
                } else {
                    sessions[phoneNumber].education = textArray[3] === '1' ? 'Graduate' : 'Not Graduate';
                    response = `CON Self Employed?
1. Yes
2. No`;
                }
            }

            // Step 5
            else if (textArray.length === 5) {
                if (!['1','2'].includes(textArray[4])) {
                    response = `CON Invalid. Self Employed?
1. Yes
2. No`;
                } else {
                    sessions[phoneNumber].selfEmployed = textArray[4] === '1' ? 'Yes' : 'No';
                    response = `CON Property Area:
1. Urban
2. Semiurban
3. Rural`;
                }
            }

            // Step 6
            else if (textArray.length === 6) {
                const areas = ['Urban','Semiurban','Rural'];
                if (!['1','2','3'].includes(textArray[5])) {
                    response = `CON Invalid. Property Area:
1. Urban
2. Semiurban
3. Rural`;
                } else {
                    sessions[phoneNumber].propertyArea = areas[textArray[5]-1];
                    response = `CON Loan Amount (KES):`;
                }
            }

            // Step 7
            else if (textArray.length === 7) {
                if (!isValidNumber(textArray[6]) || Number(textArray[6]) < 1000) {
                    response = `CON Invalid amount (>=1000):`;
                } else {
                    sessions[phoneNumber].amount = Number(textArray[6]);
                    response = `CON Monthly Income:`;
                }
            }

            // Step 8
            else if (textArray.length === 8) {
                if (!isValidNumber(textArray[7])) {
                    response = `CON Invalid income:`;
                } else {
                    sessions[phoneNumber].income = Number(textArray[7]);
                    response = `CON Coapplicant Income (0 if none):`;
                }
            }

            // Step 9
            else if (textArray.length === 9) {
                if (!isValidNumber(textArray[8])) {
                    response = `CON Invalid coapplicant income:`;
                } else {
                    sessions[phoneNumber].coapplicantIncome = Number(textArray[8]);
                    response = `CON Existing Loans (0 if none):`;
                }
            }

            // FINAL STEP
            else if (textArray.length === 10) {
                if (!isValidNumber(textArray[9])) {
                    response = `CON Invalid number:`;
                } else {
                    const session = sessions[phoneNumber];
                    session.existingLoans = Number(textArray[9]);

                    const loanID = 'LN' + Math.floor(Math.random() * 1000000);

                    const payload = {
                        Gender: session.gender,
                        Married: session.married,
                        Education: session.education,
                        Self_Employed: session.selfEmployed,
                        Property_Area: session.propertyArea,
                        Dependents: session.existingLoans,
                        ApplicantIncome: session.income,
                        CoapplicantIncome: session.coapplicantIncome,
                        LoanAmount: session.amount,
                        Loan_Amount_Term: 360,
                        Credit_History: 1
                    };

                    try {
                        const apiRes = await axios.post('http://127.0.0.1:5000/api/loan-check', payload);

                        const status = apiRes.data.result;

                        const newLoan = new Loan({
                            phoneNumber,
                            ...session,
                            status,
                            reason: apiRes.data.reason,
                            loanID
                        });

                        await newLoan.save();

                        response = `END ${status}
Loan ID: ${loanID}
Amount: KES ${session.amount}
Reason: ${apiRes.data.reason}`;

                    } catch (err) {
                        console.error(err);
                        response = `END Error processing loan`;
                    }
                }
            }
        }

        else if (textArray[0] === '3') {
            response = `END Thank you for using our service`;
        }

        else {
            response = `END Invalid input`;
        }

        res.set('Content-Type', 'text/plain');
        res.send(response);

    } catch (err) {
        console.error(err);
        res.set('Content-Type', 'text/plain');
        res.send(`END Server error`);
    }
});

// ================= START SERVER =================
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});