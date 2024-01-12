# Function to exit if user presses 'Cancel' on the final confirmation
handle_cancel() {
    exit_status=$?
    if [ $exit_status -ne 0 ]; then
        echo "User pressed Cancel. Exiting script. 👋"
        exit
    fi
}

# Function to handle the SIGINT signal (Ctrl-C)
handle_sigint() {
    clear
    echo -e "\n\n👋 Goodbye! Thank you for using AI-Audiobook-Maker. Have a great day! 🌟\n"
    exit
}

# Trap SIGINT and call handle_sigint function
trap handle_sigint SIGINT

# Function to calculate the number of parts and cost
calculate_parts_and_cost() {
    local input_file=$1
    local max_length=$2
    local total_chars=$(wc -m < "$input_file")
    local total_parts=$((total_chars / max_length))
    [ $((total_chars % max_length)) -gt 0 ] && ((total_parts++))
    echo "$total_parts"
    local cost=$(echo "scale=2; $total_chars / 1000 * 0.015" | bc)
    printf "$%.2f USD" $cost
}

split_text_file() {
    local input_file=$1
    local max_length=$2
    local part_prefix=$3
    local part_num=1
    local buffer=""
    local buffer_len=0

    while IFS= read -r line || [ -n "$line" ]; do
        if [[ -z $line ]]; then
            if (( buffer_len + 2 > max_length )); then
                echo "$buffer" > "${part_prefix}${part_num}.txt"
                ((part_num++))
                buffer=""
                buffer_len=0
            fi
            buffer+=$'\n\n'
            buffer_len=$(( buffer_len + 2 ))
        else
            if (( buffer_len + ${#line} + 1 > max_length )); then
                local last_period_pos=$(echo "$buffer" | grep -o '\.\(.*\)' | tail -1 | wc -c)
                local split_pos=$(( ${#buffer} - last_period_pos + 1 ))
                if [[ $split_pos -gt 1 ]]; then
                    local part=${buffer:0:$split_pos}
                    echo "$part" > "${part_prefix}${part_num}.txt"
                    ((part_num++))
                    buffer=${buffer:$split_pos}
                    buffer_len=${#buffer}
                else
                    echo "$buffer" > "${part_prefix}${part_num}.txt"
                    ((part_num++))
                    buffer=$line$'\n'
                    buffer_len=${#line} + 1
                fi
            else
                buffer+=$line$'\n'
                buffer_len=$(( buffer_len + ${#line} + 1 ))
            fi
        fi
    done < "$input_file"

    if [ -n "$buffer" ]; then
        echo "$buffer" > "${part_prefix}${part_num}.txt"
    fi
}

show_welcome_screen() {
    local total_cost=$(calculate_parts_and_cost "input.txt" 4000 | tail -n1)
    local welcome_message="Welcome to the Text-to-Speech Conversion Wizard! 🎙️✨\n\nThis tool helps you convert large text files into spoken words, split across multiple MP3 files.\n\n- It respects sentence boundaries, ensuring coherent audio segments.\n- You can choose different voices and control the speech speed.\n- The estimated cost for processing 'input.txt' is $total_cost (as of Jan 2024).\n\nPress OK to start configuring your conversion process."

    dialog --title "Welcome" --msgbox "$welcome_message" 20 60
}

# Call the welcome screen function at the beginning of the script
show_welcome_screen

# Ask if the user wants to process a PDF file
exec 3>&1
PROCESS_PDF=$(dialog --title "Process PDF?" --yesno "Do you want to process a PDF file?" 10 50 2>&1 1>&3)
pdf_response=$?
exec 3>&-

# Check response for processing PDF
if [ $pdf_response -eq 0 ]; then
    # Ask for the path to the PDF file
    exec 3>&1
    PDF_FILE=$(dialog --title "PDF File 📄" --inputbox "Enter the path to the PDF file:" 8 50 2>&1 1>&3)
    exec 3>&-

    # Check if the PDF file exists
    if [ ! -f "$PDF_FILE" ]; then
        dialog --title "File Not Found ❌" --msgbox "The PDF file '$PDF_FILE' was not found. Please place the file in the directory and run the script again." 10 50
        exit 1
    fi

    dialog --title "Confirmation ✅" --msgbox "PDF file set to '$PDF_FILE' 🗂️" 6 50
    # Convert PDF to text and split the text (the function needs to be defined)
    convert_pdf_to_text_and_split "$PDF_FILE" "output_txt"
    INPUT_FILE="output_txt/full_text.txt"
else
    # Ask for input file
    exec 3>&1
    INPUT_FILE=$(dialog --title "Input File 📄" --inputbox "Enter the path to the input file (default: input.txt):" 8 50 "input.txt" 2>&1 1>&3)
    exec 3>&-

    dialog --title "Confirmation ✅" --msgbox "Input file set to '$INPUT_FILE' 🗂️" 6 50
    split_text_file "$INPUT_FILE" 4000 "part_"
fi

# Check for OPENAI_API_KEY
if [ -z "${OPENAI_API_KEY}" ]; then
    exec 3>&1
    OPENAI_API_KEY=$(dialog --title "OpenAI API Key 🔑" --inputbox "Enter your OpenAI API key:" 8 50 2>&1 1>&3)
    exec 3>&-
    dialog --title "Confirmation ✅" --msgbox "API Key entered 🌐" 6 50
fi

# Get voice option
exec 3>&1
VOICE=$(dialog --title "Choose Voice 🗣️" --menu "Choose a voice:" 15 50 6 \
    "alloy" "Alloy voice" \
    "echo" "Echo voice" \
    "fable" "Fable voice" \
    "onyx" "Onyx voice" \
    "nova" "Nova voice" \
    "shimmer" "Shimmer voice" \
    "all" "All voices" 2>&1 1>&3)
exec 3>&-
dialog --title "Confirmation ✅" --msgbox "Voice selected: $VOICE 🎙️" 6 50

# Get model with additional info
exec 3>&1
MODEL=$(dialog --title "Model Selection 🧠" --menu "Choose the model (tts-1 for speed, tts-1-hd for quality):\n\nPricing: $0.015 per 1,000 characters.\n\nSelect a model:" 15 60 2 \
    "tts-1" "Optimized for speed" \
    "tts-1-hd" "Optimized for quality" 2>&1 1>&3)
exec 3>&-
dialog --title "Confirmation ✅" --msgbox "Model selected: $MODEL 🤖\n\n- tts-1: Best for faster processing.\n- tts-1-hd: Best for high-quality audio." 10 60


# Get speed
exec 3>&1
SPEED=$(dialog --title "Speech Speed ⏩" --inputbox "Enter the speed (0.25 - 4.0, default: 1.0):" 8 50 "1.0" 2>&1 1>&3)
exec 3>&-
dialog --title "Confirmation ✅" --msgbox "Speed adjusted to $SPEED ✨" 6 50

# Calculate parts and cost
TOTAL_PARTS=$(calculate_parts_and_cost "$INPUT_FILE" 4000 | head -n1)
FORMATTED_COST=$(calculate_parts_and_cost "$INPUT_FILE" 4000 | tail -n1)
dialog --title "Estimation 📊" --msgbox "Estimated number of files: $TOTAL_PARTS 📈\nEstimated cost: $FORMATTED_COST 💰" 8 50

# Final confirmation with cancel check
exec 3>&1
dialog --title "Final Confirmation 🚀" --yesno \
    "Ready to start conversion with these settings?\n\n- Voice: $VOICE\n- Model: $MODEL\n- Speed: $SPEED\n- Estimated number of files: $TOTAL_PARTS\n- Estimated cost: $FORMATTED_COST\n\nPress 'Yes' to start, 'No' to exit." 15 60
exec 3>&-
handle_cancel

# Check response
if [ $response -eq 1 ]; then
    echo "Conversion canceled."
    exit 0
fi
clear
# Split and convert logic
split_text_file "$INPUT_FILE" 4000 "part_"

# Convert each part to an MP3 file
for ((current_part = 1; current_part <= TOTAL_PARTS; current_part++)); do
    file="part_${current_part}.txt"
    echo -e "Converting part $current_part of $TOTAL_PARTS to MP3 at ${SPEED} speed with voice ${VOICE}... ️🎶" | lolcat
    
    # Use a pipe to send the content of the file to ospeak with the chosen speed and voice
    cat "$file" | ospeak --voice $VOICE --speed $SPEED -o "${file%.txt}.mp3"
    if [ $? -ne 0 ]; then
        echo -e "❌ Error occurred while converting part $current_part. Exiting." | lolcat
        exit 1
    fi
done

# Concatenate all MP3 files
echo -e "Stitching all MP3 files together... 🧵🎵" | lolcat
ffmpeg -f concat -safe 0 -i <(for f in part_*.mp3; do echo "file '$PWD/$f'"; done) -c copy output.mp3

if [ $? -ne 0 ]; then
clear
    echo -e "❌ Error occurred while stitching MP3 files. Exiting." | lolcat
    exit 1
fi
clear
echo -e "Final output file 'output.mp3' is ready! 🌟🎉" | lolcat
