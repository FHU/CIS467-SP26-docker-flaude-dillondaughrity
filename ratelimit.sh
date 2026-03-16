for i in $(seq 1 50);
    do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/; 
done